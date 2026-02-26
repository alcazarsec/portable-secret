const decoder = new TextDecoder();
const encoder = new TextEncoder();

const ARGON2_BASELINE_ITERATIONS = 10;
const PBKDF2_BASELINE_ITERATIONS = 5_000_000;

type Argon2idFn = (options: {
    password: string;
    salt: Uint8Array;
    iterations: number;
    memorySize: number;
    parallelism: number;
    hashLength: number;
    outputType: 'binary';
}) => Promise<Uint8Array>;

type Argon2KdfParams = {
    name: 'argon2id';
    iterations: number;
    memorySize: number;
    parallelism: number;
    hashLength: number;
};

type Pbkdf2KdfParams = {
    name: 'pbkdf2';
    iterations: number;
    hash: 'SHA-256';
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

type Argon2DeriveParams = {
    password: string;
    salt: Uint8Array;
    iterations: number;
    memorySize: number;
    parallelism: number;
    hashLength: number;
};

type BundleFile = {
    name: string;
    mime: string;
    size: number;
    dataB64: string;
};

type BundlePayload = {
    version: '1';
    text?: string;
    files: BundleFile[];
};

type KdfParams = Argon2KdfParams | Pbkdf2KdfParams;

type Metadata = {
    kdf:
        | {
              name: 'argon2id';
              saltB64: string;
              iterations: number;
              memorySize: number;
              parallelism: number;
              hashLength: number;
          }
        | {
              name: 'pbkdf2';
              saltB64: string;
              iterations: number;
              hash: 'SHA-256';
          };
    cipher: { ivB64: string };
    payload: {
        kind: 'bundle';
        compression?: 'gzip';
        entries: Array<{ name: string; mime: string; size: number }>;
        hasText: boolean;
        fileCount: number;
        size: number;
        mime: 'application/json';
        name: string;
    };
};

function getArgon2id(): Argon2idFn | undefined {
    return (globalThis as { hashwasm?: { argon2id?: Argon2idFn } }).hashwasm?.argon2id;
}

// HTML element references.
function requiredEl<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) {
        throw new Error(`Missing element #${id}`);
    }
    return el as T;
}

const statusEl = requiredEl<HTMLDivElement>('ps-status');
const decryptedWrapperEl = requiredEl<HTMLDivElement>('ps-decrypted-wrapper');
const textWrapperEl = requiredEl<HTMLDivElement>('ps-text-wrapper');
const outputEl = requiredEl<HTMLPreElement>('ps-output');
const filesWrapperEl = requiredEl<HTMLDivElement>('ps-files-wrapper');
const filesListEl = requiredEl<HTMLUListElement>('ps-files');
const formWrapperEl = requiredEl<HTMLFormElement>('ps-form');
const passwordEl = requiredEl<HTMLInputElement>('ps-password');
const decryptButton = requiredEl<HTMLButtonElement>('ps-decrypt');
const decryptTimeEl = requiredEl<HTMLSpanElement>('ps-decrypt-time');
const progressContainer = requiredEl<HTMLDivElement>('ps-progress-container');
const progressBar = requiredEl<HTMLDivElement>('ps-progress-bar');
const elapsedEl = requiredEl<HTMLSpanElement>('ps-elapsed');
const remainingEl = requiredEl<HTMLSpanElement>('ps-remaining');
const iterationsInfoEl = requiredEl<HTMLDivElement>('ps-iterations-info');
const connectivityOnlineEl = requiredEl<HTMLDivElement>('ps-connectivity-online');
const connectivityLocalEl = requiredEl<HTMLDivElement>('ps-connectivity-local');
const connectivityOfflineEl = requiredEl<HTMLDivElement>('ps-connectivity-offline');

// Formatting helpers.
function formatDurationCompact(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed()}s`;
    if (ms < 3_600_000) return `${(ms / 60_000).toFixed()}m`;
    return `${(ms / 3_600_000).toFixed()}h`;
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} seconds`;
    if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)} minutes`;
    return `${(ms / 3_600_000).toFixed(1)} hours`;
}

function formatBytes(bytes: number): string {
    if (bytes < 1000) return `${bytes} B`;
    const kb = bytes / 1000;
    if (kb < 1000) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1000;
    if (mb < 1000) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1000;
    return `${gb.toFixed(2)} GB`;
}

function readBlock(label: string): string | null {
    const html = document.documentElement.innerHTML;
    const regex = new RegExp(`<!--PS:${label}:([A-Za-z0-9+/=]+)-->`);
    const match = html.match(regex);
    return match ? match[1] : null;
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function setStatus(message: string): void {
    const hasMessage = message.trim().length > 0;
    statusEl.textContent = message;
    if (hasMessage) {
        statusEl.classList.remove('hidden');
    } else {
        statusEl.classList.add('hidden');
    }
}

function setConnectivityState(): void {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    const isLocalFile = window.location.protocol === 'file:';
    const isOnline = navigator.onLine;

    connectivityOnlineEl.classList.add('hidden');
    connectivityLocalEl.classList.add('hidden');
    connectivityOfflineEl.classList.add('hidden');

    if (isOnline) {
        connectivityOnlineEl.classList.remove('hidden');
    } else if (isLocalFile) {
        connectivityLocalEl.classList.remove('hidden');
    } else {
        connectivityOfflineEl.classList.remove('hidden');
    }
}

function renderText(text: string | undefined): void {
    if (!text) {
        outputEl.textContent = 'No text was included in this portable secret.';
        return;
    }
    outputEl.textContent = text;
}

function renderFiles(files: BundleFile[] | undefined): void {
    filesListEl.innerHTML = '';

    if (!files?.length) {
        const item = document.createElement('li');
        item.className = 'text-muted-foreground';
        item.textContent = 'No files were included in this portable secret.';
        filesListEl.append(item);
        return;
    }

    for (const file of files) {
        const item = document.createElement('li');
        item.className = 'border-input flex items-center justify-between gap-3 rounded-lg border px-3 py-2';
        const nameEl = document.createElement('span');
        nameEl.textContent = file.name;
        const sizeEl = document.createElement('span');
        sizeEl.className = 'text-muted-foreground text-xs';
        sizeEl.textContent = formatBytes(file.size);
        const link = document.createElement('a');
        link.className = 'text-primary text-xs font-semibold';
        const blob = new Blob([base64ToBytes(file.dataB64)], {
            type: file.mime
        });
        link.href = URL.createObjectURL(blob);
        link.download = file.name || 'secret';
        link.textContent = 'Download';
        item.append(nameEl, sizeEl, link);
        filesListEl.append(item);
    }
}

// HTML updates: progress and status.
function showProgress(): void {
    progressContainer.classList.remove('hidden');
}

function hideProgress(): void {
    progressContainer.classList.add('hidden');
    progressBar.style.transform = 'translateX(-100%)';
    elapsedEl.textContent = '';
    remainingEl.textContent = '';
}

function setProgress(percent: number): void {
    progressBar.style.transform = `translateX(-${100 - percent}%)`;
}

function updateTimeDisplay(elapsedMs: number, remainingMs: number): void {
    elapsedEl.textContent = `${formatDurationCompact(elapsedMs)} elapsed`;
    remainingEl.textContent = `${formatDurationCompact(Math.max(0, remainingMs))} remaining`;
}

function simulateProgress(estimatedMs: number): () => void {
    console.log('[Progress] simulateProgress() started, estimated:', estimatedMs.toFixed(0), 'ms');
    const startTime = performance.now();
    let animationId: number;

    function update() {
        const elapsed = performance.now() - startTime;
        const remaining = Math.max(0, estimatedMs - elapsed);
        const rawProgress = Math.min(elapsed / estimatedMs, 0.99);
        setProgress(Math.round(rawProgress * 100));
        updateTimeDisplay(elapsed, remaining);
        if (rawProgress < 1) {
            animationId = requestAnimationFrame(update);
        }
    }

    animationId = requestAnimationFrame(update);

    return () => {
        cancelAnimationFrame(animationId);
        setProgress(100);
        updateTimeDisplay(estimatedMs, 0);
    };
}

// Argon2 and worker handling.

let argon2Worker: Worker | null = null;
let argon2WorkerFailed = false;
let argon2WorkerSeq = 0;
const argon2WorkerPending = new Map<
    number,
    { resolve: (buffer: ArrayBuffer) => void; reject: (error: Error) => void }
>();

function getArgon2WorkerSource(): string | null {
    const scriptEl = document.getElementById('ps-argon2');
    const scriptText = scriptEl?.textContent?.trim();
    if (!scriptText) {
        return null;
    }
    return `${scriptText}
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
        console.error('[Decrypt] Argon2 worker failed to initialize', error);
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
        console.error('[Decrypt] Argon2 worker error', event);
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

// Key derivation helpers.
async function deriveKeyBytes({
    password,
    salt,
    iterations,
    memorySize,
    parallelism,
    hashLength
}: Argon2DeriveParams): Promise<ArrayBuffer> {
    const worker = getArgon2Worker();
    if (!worker) {
        const argon2 = getArgon2id();
        if (!argon2) {
            throw new Error('Argon2 library failed to load.');
        }
        const derived = (await argon2({
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

async function deriveKey(password: string, kdf: KdfParams & { salt: Uint8Array<ArrayBuffer> }): Promise<CryptoKey> {
    const startTime = performance.now();
    let key: CryptoKey;
    if (kdf.name === 'pbkdf2') {
        const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, [
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
            ['decrypt']
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
        key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    }
    const duration = performance.now() - startTime;
    console.log('[Decrypt] Key derivation completed in', duration.toFixed(), 'ms');
    return key;
}

// Calibration and time estimates.
let iterationsPerMs: number | null = null;
let estimatedMs: number | null = null;

function getCalibrationBaselineIterations(kdf: KdfParams): number {
    const baselineTarget = kdf.name === 'pbkdf2' ? PBKDF2_BASELINE_ITERATIONS : ARGON2_BASELINE_ITERATIONS;
    return Math.max(1, Math.min(kdf.iterations, baselineTarget));
}

async function runCalibration(kdf: KdfParams): Promise<number> {
    const baselineIterations = getCalibrationBaselineIterations(kdf);
    const testPassword = crypto.getRandomValues(new Uint8Array(16)).toString();
    const testSalt = crypto.getRandomValues(new Uint8Array(16));

    const start = performance.now();
    await deriveKey(testPassword, { ...kdf, salt: testSalt, iterations: baselineIterations });
    const duration = Math.max(1, performance.now() - start);
    const result = baselineIterations / duration;
    console.log('[Decrypt] Calibration complete:', (result * 1000).toFixed(), 'iterations/s');
    return result;
}

function setIterationsInfo(kdf: KdfParams, estimateMs: number): void {
    decryptTimeEl.textContent = ` ~${formatDurationCompact(estimateMs)}`;
    if (kdf.name === 'pbkdf2') {
        iterationsInfoEl.textContent = `PBKDF2 ${kdf.hash} ${kdf.iterations.toLocaleString()} iterations (~${formatDuration(estimateMs)})`;
        return;
    }
    iterationsInfoEl.textContent = `Argon2id m=${formatBytes(
        kdf.memorySize * 1000
    )}, t=${kdf.iterations}, p=${kdf.parallelism} (~${formatDuration(estimateMs)})`;
}

function getMetadata(): Metadata | null {
    const metadataBlock = readBlock('METADATA');
    if (!metadataBlock) {
        return null;
    }
    return JSON.parse(decoder.decode(base64ToBytes(metadataBlock))) as Metadata;
}

async function initializeCalibration(): Promise<void> {
    console.log('[Init] Starting calibration...');

    try {
        const metadata = getMetadata();
        if (!metadata) {
            decryptTimeEl.textContent = '';
            iterationsInfoEl.textContent = 'Unable to load encryption parameters.';
            console.log('[Init] No metadata block found');
            return;
        }

        iterationsPerMs = await runCalibration(metadata.kdf);
        estimatedMs = metadata.kdf.iterations / iterationsPerMs;
        console.log(
            '[Init] Estimated decryption time:',
            estimatedMs.toFixed(0),
            'ms, iterations:',
            metadata.kdf.iterations
        );
        setIterationsInfo(metadata.kdf, estimatedMs);
    } catch (error) {
        console.log('[Init] Could not parse metadata for time estimation', error);
        decryptTimeEl.textContent = '';
        iterationsInfoEl.textContent = 'Unable to load encryption parameters.';
    }
}

// Decryption flow.
async function decryptPayload(): Promise<void> {
    console.log('[Decrypt] Starting decryption');

    const password = passwordEl.value.trim().normalize();
    if (!password) {
        setStatus('Enter a password to decrypt.');
        return;
    }

    const metadataBlock = readBlock('METADATA');
    const payloadBlock = readBlock('PAYLOAD');
    if (!metadataBlock || !payloadBlock) {
        setStatus('Encrypted payload not found.');
        return;
    }

    let metadata: Metadata;
    try {
        metadata = JSON.parse(decoder.decode(base64ToBytes(metadataBlock))) as Metadata;
    } catch (error) {
        setStatus('Metadata could not be parsed.');
        return;
    }

    let stopProgress: (() => void) | null = null;

    try {
        decryptButton.disabled = true;

        let currentIterationsPerMs = iterationsPerMs;
        if (!currentIterationsPerMs) {
            setStatus('Calibrating...');
            currentIterationsPerMs = await runCalibration(metadata.kdf);
            iterationsPerMs = currentIterationsPerMs;
        }

        let currentEstimatedMs = estimatedMs;
        if (!currentEstimatedMs) {
            currentEstimatedMs = metadata.kdf.iterations / currentIterationsPerMs;
        }

        setStatus(`Deriving key (~${formatDuration(currentEstimatedMs)})...`);
        showProgress();
        stopProgress = simulateProgress(currentEstimatedMs);

        const key = await deriveKey(password, {
            ...metadata.kdf,
            salt: base64ToBytes(metadata.kdf.saltB64)
        });

        stopProgress();
        stopProgress = null;
        setProgress(100);

        setStatus('Decrypting...');
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: base64ToBytes(metadata.cipher.ivB64).buffer as ArrayBuffer },
            key,
            base64ToBytes(payloadBlock).buffer as ArrayBuffer
        );

        hideProgress();
        const bytes = new Uint8Array(plaintext);
        if (metadata.payload.kind !== 'bundle') {
            throw new Error('Unsupported payload format.');
        }

        let bundleBytes = bytes;
        if (metadata.payload.compression === 'gzip') {
            if (typeof DecompressionStream === 'undefined') {
                throw new Error('DecompressionStream is not supported in this browser.');
            }
            const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
            const buffer = await new Response(stream).arrayBuffer();
            bundleBytes = new Uint8Array(buffer);
        }

        const bundle = JSON.parse(decoder.decode(bundleBytes)) as BundlePayload;
        renderText(bundle.text);
        renderFiles(bundle.files);
        formWrapperEl.classList.remove('flex');
        formWrapperEl.classList.add('hidden');
        decryptedWrapperEl.classList.remove('hidden');
        decryptedWrapperEl.classList.add('flex');
        setStatus(bundle.files?.length || bundle.text ? 'Decrypted.' : 'Decrypted (empty payload).');
        setDisarmedTheme(true);
        console.log('[Decrypt] Decryption completed successfully');
    } catch (error) {
        console.error('[Decrypt] Error:', error);
        hideProgress();
        formWrapperEl.classList.remove('hidden');
        setStatus('Decryption failed. Check the password.');
    } finally {
        if (stopProgress) stopProgress();
        decryptButton.disabled = false;
    }
}

// Event wiring.
formWrapperEl.addEventListener('submit', (event) => {
    event.preventDefault();
    void decryptPayload();
});
window.addEventListener('load', () => {
    void initializeCalibration();
    setConnectivityState();
    window.addEventListener('online', setConnectivityState);
    window.addEventListener('offline', setConnectivityState);
});

function setDisarmedTheme(enable: boolean): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (enable) root.classList.add('disarmed-theme');
    else root.classList.remove('disarmed-theme');
}
