import { argon2id } from 'hash-wasm';
import argon2Script from 'hash-wasm/dist/argon2.umd.min.js?raw';

const textEncoder = new TextEncoder();

const ARGON2_BASELINE_ITERATIONS = 10;
const PBKDF2_BASELINE_ITERATIONS = 5_000_000;

// Types.
export type PSArgon2Config = {
    name: 'argon2id';
    iterations: number;
    memorySize: number;
    parallelism: number;
    hashLength: number;
};

export type PSPbkdf2Config = {
    name: 'pbkdf2';
    iterations: number;
    hash: 'SHA-256';
};

export type PSKdfConfig = PSArgon2Config | PSPbkdf2Config;

export type PSKdfParams =
    | (PSArgon2Config & { salt: Uint8Array<ArrayBuffer> })
    | (PSPbkdf2Config & { salt: Uint8Array<ArrayBuffer> });

export type PSCipherParams = {
    iv: Uint8Array<ArrayBuffer>;
};

export type PSEncryptedPayload = {
    ciphertext: Uint8Array;
    salt: Uint8Array<ArrayBuffer>;
    iv: Uint8Array<ArrayBuffer>;
};

type Argon2WorkerRequest = {
    id: number;
    password: string;
    salt: Uint8Array;
    iterations: number;
    memorySize: number;
    parallelism: number;
    hashLength: number;
};

type Argon2WorkerResponse = {
    id: number;
    derived?: ArrayBuffer;
    error?: string;
};

type Argon2Params = {
    password: string;
    salt: Uint8Array;
    iterations: number;
    memorySize: number;
    parallelism: number;
    hashLength: number;
};

type DerivedKeyCacheEntry = {
    salt: Uint8Array<ArrayBuffer>;
    key: CryptoKey;
};

const derivedKeyCache = new Map<string, DerivedKeyCacheEntry>();

async function digestMessage(message: string): Promise<string> {
    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Argon2 worker handling.
let argon2Worker: Worker | null = null;
let argon2WorkerFailed = false;
let argon2WorkerSeq = 0;
const argon2WorkerPending = new Map<
    number,
    { resolve: (buffer: ArrayBuffer) => void; reject: (error: Error) => void }
>();

function getArgon2WorkerSource(): string | null {
    return `${argon2Script}
self.onmessage = async (event) => {
    const { id, password, salt, iterations, memorySize, parallelism, hashLength } = event.data;
    try {
        const argon2idWorker = self.hashwasm?.argon2id;
        if (!argon2idWorker) {
            throw new Error('Argon2 library failed to load.');
        }
        const derived = await argon2idWorker({
            password,
            salt,
            iterations,
            memorySize,
            parallelism,
            hashLength,
            outputType: 'binary'
        });
        const buffer = derived.buffer.slice(
            derived.byteOffset,
            derived.byteOffset + derived.byteLength
        );
        self.postMessage({ id, derived: buffer }, [buffer]);
    } catch (error) {
        self.postMessage({
            id,
            error: error instanceof Error ? error.message : 'Argon2 derivation failed.'
        });
    }
};`;
}

function getArgon2Worker(): Worker | null {
    if (argon2WorkerFailed) {
        return null;
    }
    if (argon2Worker) {
        return argon2Worker;
    }
    const source = getArgon2WorkerSource();
    if (!source) {
        argon2WorkerFailed = true;
        return null;
    }
    const blob = new Blob([source], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    try {
        argon2Worker = new Worker(url);
    } catch (error) {
        console.error('[Encrypt] Argon2 worker failed to initialize', error);
        argon2WorkerFailed = true;
        argon2Worker = null;
        URL.revokeObjectURL(url);
        return null;
    }
    URL.revokeObjectURL(url);

    argon2Worker.addEventListener('message', (event: MessageEvent<Argon2WorkerResponse>) => {
        const { id, derived, error } = event.data;
        const pending = argon2WorkerPending.get(id);
        if (!pending) {
            return;
        }
        argon2WorkerPending.delete(id);
        if (error) {
            pending.reject(new Error(error));
            return;
        }
        if (!derived) {
            pending.reject(new Error('Argon2 worker did not return output.'));
            return;
        }
        pending.resolve(derived);
    });

    argon2Worker.addEventListener('error', (event) => {
        console.error('[Encrypt] Argon2 worker error', event);
        argon2WorkerFailed = true;
        for (const { reject } of argon2WorkerPending.values()) {
            reject(new Error('Argon2 worker failed.'));
        }
        argon2WorkerPending.clear();
        argon2Worker?.terminate();
        argon2Worker = null;
    });

    return argon2Worker;
}

async function deriveKeyBytes({
    password,
    salt,
    iterations,
    memorySize,
    parallelism,
    hashLength
}: Argon2Params): Promise<ArrayBuffer> {
    const worker = getArgon2Worker();
    if (!worker) {
        const derived = (await argon2id({
            password,
            salt,
            iterations,
            memorySize,
            parallelism,
            hashLength,
            outputType: 'binary'
        })) as Uint8Array<ArrayBuffer>;
        return derived.buffer;
    }

    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const id = argon2WorkerSeq + 1;
        argon2WorkerSeq = id;
        argon2WorkerPending.set(id, { resolve, reject });
        const message: Argon2WorkerRequest = {
            id,
            password,
            salt,
            iterations,
            memorySize,
            parallelism,
            hashLength
        };
        worker.postMessage(message);
    });
    return buffer;
}

export async function deriveKey(password: string, kdf: PSKdfParams): Promise<CryptoKey> {
    const startTime = performance.now();
    let key: CryptoKey;
    if (kdf.name === 'pbkdf2') {
        const baseKey = await crypto.subtle.importKey('raw', textEncoder.encode(password), { name: 'PBKDF2' }, false, [
            'deriveKey'
        ]);
        key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                hash: kdf.hash,
                salt: kdf.salt,
                iterations: kdf.iterations
            },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    } else {
        const keyBytes = await deriveKeyBytes({
            password,
            salt: kdf.salt,
            iterations: kdf.iterations,
            memorySize: kdf.memorySize,
            parallelism: kdf.parallelism,
            hashLength: kdf.hashLength
        });
        key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
    const duration = performance.now() - startTime;
    console.log('[Encrypt] Key derivation completed in', duration.toFixed(), 'ms');
    return key;
}

export async function encryptBytes(
    password: string,
    data: Uint8Array,
    kdfParams: PSKdfConfig
): Promise<PSEncryptedPayload> {
    const cacheKey = await digestMessage(password);
    const cached = derivedKeyCache.get(cacheKey);

    let salt: Uint8Array<ArrayBuffer>;
    let key: CryptoKey;
    if (cached) {
        salt = cached.salt;
        key = cached.key;
        console.log('[Encrypt] Key derived from cache');
    } else {
        salt = crypto.getRandomValues(new Uint8Array(16));
        key = await deriveKey(password, { ...kdfParams, salt });
        derivedKeyCache.set(cacheKey, { salt, key });
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data.buffer as ArrayBuffer);
    return {
        ciphertext: new Uint8Array(encrypted),
        salt,
        iv
    };
}

function getCalibrationBaselineIterations(kdf: PSKdfConfig): number {
    const baselineTarget = kdf.name === 'pbkdf2' ? PBKDF2_BASELINE_ITERATIONS : ARGON2_BASELINE_ITERATIONS;
    return Math.max(1, Math.min(kdf.iterations, baselineTarget));
}

export async function runCalibration(kdf: PSKdfConfig): Promise<number> {
    const baselineIterations = getCalibrationBaselineIterations(kdf);
    const testPassword = crypto.getRandomValues(new Uint8Array(16)).toString();
    const testSalt = crypto.getRandomValues(new Uint8Array(16));

    const start = performance.now();
    await deriveKey(testPassword, { ...kdf, salt: testSalt, iterations: baselineIterations });
    const duration = Math.max(1, performance.now() - start);
    const result = baselineIterations / duration;
    console.log('[Encrypt] Calibration complete:', (result * 1000).toFixed(), 'iterations/s');
    return result;
}
