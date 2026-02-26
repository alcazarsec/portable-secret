import argon2Script from 'hash-wasm/dist/argon2.umd.min.js?raw';
import templateStyle from './template/template.css?raw';
import templateHtml from './template/template.html?raw';
import templateScript from './template/template.js?raw';

export type PSPayloadDescriptor = {
    kind: 'bundle';
    name: string;
    mime: 'application/json';
    size: number;
    compression: 'gzip';
    fileCount: number;
    hasText: boolean;
    entries: Array<{
        name: string;
        mime: string;
        size: number;
    }>;
};

export type PSMetadata = {
    version: '3';
    createdAt: string;
    hint: string;
    kdf:
        | {
              name: 'argon2id';
              iterations: number;
              memorySize: number;
              parallelism: number;
              hashLength: number;
              saltB64: string;
          }
        | {
              name: 'pbkdf2';
              hash: 'SHA-256';
              iterations: number;
              saltB64: string;
          };
    cipher: {
        name: 'AES-GCM';
        ivB64: string;
    };
    payload: PSPayloadDescriptor;
};

export function uint8ArrayToBase64(data: Uint8Array): string {
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export function stringToBase64(value: string): string {
    return uint8ArrayToBase64(new TextEncoder().encode(value));
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
}

export function buildPSHtml(metadata: PSMetadata, payloadBase64: string): string {
    const metadataBase64 = stringToBase64(JSON.stringify(metadata));
    const hint = metadata.hint ? escapeHtml(metadata.hint) : 'No hint provided.';
    const payloadName = escapeHtml(metadata.payload.name || 'secret');
    const payloadSize = formatBytes(metadata.payload.size);
    const argon2Tag =
        metadata.kdf.name === 'argon2id'
            ? `<script id="ps-argon2">
${argon2Script}
</script>`
            : '';

    return templateHtml
        .replace('/*{.STYLE}*/', templateStyle)
        .replace('/*{.SCRIPT}*/', templateScript)
        .replace('<!--{.ARGON2_SCRIPT}-->', argon2Tag)
        .replace('{.HINT}', hint)
        .replace('{.PAYLOAD_NAME}', payloadName)
        .replace('{.PAYLOAD_SIZE}', payloadSize)
        .replace('{.METADATA}', metadataBase64)
        .replace('{.PAYLOAD}', payloadBase64);
}
