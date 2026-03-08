<script lang="ts">
    import { browser } from '$app/environment';
    import { COMPANY_NAME, LANDING_HOSTNAME } from '$lib/config.js';
    import CompanyLogoLong from '$lib/components/landing/CompanyLogoLong.svelte';
    import CompanyLogoSquare from '$lib/components/landing/CompanyLogoSquare.svelte';
    import PSLogoSquare from '$lib/components/landing/PSLogoSquare.svelte';
    import { buttonVariants } from '$lib/components/ui/button';
    import { Button } from '$lib/components/ui/button/index.js';
    import * as Collapsible from '$lib/components/ui/collapsible/index.js';
    import * as Field from '$lib/components/ui/field/index.js';
    import * as FileDropZone from '$lib/components/ui/file-drop-zone/index.js';
    import * as InputGroup from '$lib/components/ui/input-group/index.js';
    import { Progress } from '$lib/components/ui/progress/index.js';
    import * as Select from '$lib/components/ui/select/index.js';
    import { Textarea } from '$lib/components/ui/textarea/index.js';
    import { Toggle } from '$lib/components/ui/toggle/index.js';
    import { encryptBytes, runCalibration } from '$lib/ps/crypto';
    import { buildPSHtml, uint8ArrayToBase64, type PSMetadata } from '$lib/ps/format';
    import { cn } from '$lib/utils';
    import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
    import EyeIcon from '@lucide/svelte/icons/eye';
    import EyeOffIcon from '@lucide/svelte/icons/eye-off';
    import FileIcon from '@lucide/svelte/icons/file';
    import FileArchiveIcon from '@lucide/svelte/icons/file-archive';
    import FileAudioIcon from '@lucide/svelte/icons/file-audio';
    import FileCodeIcon from '@lucide/svelte/icons/file-code';
    import FileImageIcon from '@lucide/svelte/icons/file-image';
    import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
    import FileTextIcon from '@lucide/svelte/icons/file-text';
    import FileVideoIcon from '@lucide/svelte/icons/file-video';
    import PaperclipIcon from '@lucide/svelte/icons/paperclip';
    import XIcon from '@lucide/svelte/icons/x';
    import { slide } from 'svelte/transition';
    import FAQ from './faq.md';

    type DurationOption = {
        value: number;
        label: string;
    };

    const DURATION_OPTIONS: DurationOption[] = [
        { value: 1_000, label: '1 second' },
        { value: 5_000, label: '5 seconds' },
        { value: 125_000, label: '2 minutes' }
    ];

    const ARGON2_MEMORY_KIB_DEFAULT = 64 * 1000;
    const ARGON2_PARALLELISM = 1;
    const ARGON2_HASH_LENGTH = 32;
    const MIN_ARGON2_ITERATIONS = 10;

    const PBKDF2_HASH = 'SHA-256' as const;
    const MIN_PBKDF2_ITERATIONS = 5_000_000;

    const landingUrl = `https://${LANDING_HOSTNAME}/`;
    const dmsUrl = `https://${LANDING_HOSTNAME}/deadmanswitch`;
    const pageTitle = 'Portable Secret · create';
    const pageDescription = 'Generate self-contained HTML files that decrypt locally in your browser.';
    const pageUrl = $derived(`https://${LANDING_HOSTNAME}/ps`);
    const footerProducts = [
        { label: 'Silent alarm', href: landingUrl },
        { label: "Dead Man's Switch", href: dmsUrl }
    ];

    type KdfMode = 'argon2id' | 'pbkdf2';

    type KdfOption = {
        value: KdfMode;
        label: string;
    };

    const KDF_OPTIONS: KdfOption[] = [
        { value: 'pbkdf2', label: 'PBKDF2' },
        { value: 'argon2id', label: 'Argon2id' }
    ];

    /** True if device is likely desktop/laptop (strong); false for mobile/tablet (weak). */
    function isLikelyStrongDevice(): boolean {
        if (typeof navigator === 'undefined') return false;
        const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
        if (nav.userAgentData?.mobile === false) return true;
        if (nav.userAgentData?.mobile === true) return false;
        const ua = navigator.userAgent;
        const mobilePattern = /Mobi|Android|iPhone|iPad|webOS|BlackBerry|IEMobile|Opera Mini/i;
        return !mobilePattern.test(ua);
    }

    type Argon2MemoryOption = { value: number; label: string };
    const ARGON2_MEMORY_OPTIONS: Argon2MemoryOption[] = [
        { value: 8 * 1000, label: '8 MB' },
        { value: 64 * 1000, label: '64 MB' },
        { value: 512 * 1000, label: '512 MB' }
    ];

    type BundlePayload = {
        version: '1';
        text?: string;
        files: Array<{
            name: string;
            mime: string;
            size: number;
            dataB64: string;
        }>;
    };

    let files = $state<File[]>([]);
    let textPayload = $state('');
    let hint = $state('');
    let password = $state('');
    let passwordVisible = $state(false);
    let isGenerating = $state(false);
    let error = $state('');
    let lastGeneratedName = $state('');
    let lastGeneratedURL: string = $state('');
    let advancedOpen = $state(false);
    let targetDurationMs = $state(1_000);
    let kdfMode = $state<KdfMode>('pbkdf2');
    let defaultKdfSet = $state(false);
    let argon2MemoryKib = $state(ARGON2_MEMORY_KIB_DEFAULT);
    let progressValue = $state(0);
    let elapsedMs = $state(0);
    let estimatedTotalMs = $state(0);

    // Calibration baseline - recalculated on KDF changes
    let baseline = $state<number | null>(null);
    let baselineMode = $state<KdfMode | null>(null);

    // Derived: remaining time
    let remainingMs = $derived(Math.max(0, estimatedTotalMs - elapsedMs));

    let calibrationToken = 0;

    let isOnline = $state(true);
    let isLocalFile = $state(false);
    $effect(() => {
        if (!browser) return;
        isLocalFile = location.protocol === 'file:';
        isOnline = navigator.onLine;
        const onOnline = () => (isOnline = true);
        const onOffline = () => (isOnline = false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    });

    function getArgon2MinIterations(): number {
        switch (argon2MemoryKib) {
            case 8 * 1000:
                return MIN_ARGON2_ITERATIONS * 10;
            case 64 * 1000:
                return MIN_ARGON2_ITERATIONS;
            case 512 * 1000:
                return MIN_ARGON2_ITERATIONS / 10;
            default:
                return MIN_ARGON2_ITERATIONS;
        }
    }

    function getMinIterations(mode: KdfMode): number {
        return mode === 'pbkdf2' ? MIN_PBKDF2_ITERATIONS : getArgon2MinIterations();
    }

    function buildKdfConfig(mode: KdfMode, iterations: number, memoryKib?: number) {
        if (mode === 'pbkdf2') {
            return {
                name: 'pbkdf2' as const,
                hash: PBKDF2_HASH,
                iterations
            };
        }
        return {
            name: 'argon2id' as const,
            iterations,
            memorySize: memoryKib ?? ARGON2_MEMORY_KIB_DEFAULT,
            parallelism: ARGON2_PARALLELISM,
            hashLength: ARGON2_HASH_LENGTH
        };
    }

    $effect(() => {
        if (!browser) return;
        if (!defaultKdfSet) {
            kdfMode = isLikelyStrongDevice() ? 'argon2id' : 'pbkdf2';
            defaultKdfSet = true;
        }
    });

    $effect(() => {
        if (!browser) return;
        if (!defaultKdfSet) return;
        const config = buildKdfConfig(kdfMode, getMinIterations(kdfMode), argon2MemoryKib);

        setTimeout(async () => {
            const token = (calibrationToken += 1);
            baseline = null;
            baselineMode = null;
            const result = await runCalibration(config);
            if (token !== calibrationToken) return;
            baseline = result;
            baselineMode = kdfMode;
        }, 0);
    });

    // Calculate iterations for any target duration using the baseline
    function getIterationsForDuration(durationMs: number, mode: KdfMode): number {
        const minIterations = getMinIterations(mode);
        if (!baseline || baselineMode !== mode) return minIterations;
        const scaled = Math.ceil(baseline * durationMs);
        return Math.max(minIterations, scaled);
    }

    // Derived: current iterations based on selected duration
    let currentIterations = $derived(getIterationsForDuration(targetDurationMs, kdfMode));

    // Format duration for display (compact)
    function formatDurationCompact(ms: number): string {
        if (ms < 1000) return `${Math.round(ms)}ms`;
        if (ms < 60_000) return `${(ms / 1000).toFixed()}s`;
        if (ms < 3_600_000) return `${(ms / 60_000).toFixed()}m`;
        return `${(ms / 3_600_000).toFixed()}h`;
    }

    // Format duration in natural units
    function formatDuration(ms: number): string {
        if (ms < 1000) return `${ms} ms`;
        if (ms < 60_000) return `${(ms / 1000).toFixed(1)} seconds`;
        if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)} minutes`;
        return `${(ms / 3_600_000).toFixed(1)} hours`;
    }

    // Selected duration label for the Select component
    let selectedDurationLabel = $derived(
        DURATION_OPTIONS.find((o) => o.value === targetDurationMs)?.label ?? 'unknown'
    );

    let selectedKdfLabel = $derived(KDF_OPTIONS.find((o) => o.value === kdfMode)?.label ?? 'unknown');

    let selectedArgon2MemoryLabel = $derived(
        ARGON2_MEMORY_OPTIONS.find((o) => o.value === argon2MemoryKib)?.label ?? '8 MB'
    );

    function fileLabel(file: File): string {
        const fileWithPath = file as File & { webkitRelativePath?: string };
        return fileWithPath.webkitRelativePath || file.name || 'file';
    }

    function fileKey(file: File): string {
        return `${fileLabel(file)}:${file.size}:${file.lastModified}`;
    }

    type FileCategory = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'code' | 'spreadsheet' | 'archive' | 'other';

    const EXTENSION_CATEGORIES: Record<FileCategory, Set<string>> = {
        image: new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tiff']),
        video: new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'mpeg']),
        audio: new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']),
        pdf: new Set(['pdf']),
        text: new Set(['txt', 'log', 'rtf']),
        code: new Set(['js', 'ts', 'jsx', 'tsx', 'json', 'md', 'html', 'css', 'scss', 'svelte', 'yaml', 'yml']),
        spreadsheet: new Set(['csv', 'xls', 'xlsx', 'ods']),
        archive: new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2']),
        other: new Set()
    };

    function fileExtension(file: File): string {
        const name = file.name || '';
        const lastDot = name.lastIndexOf('.');
        if (lastDot === -1) return '';
        return name.slice(lastDot + 1).toLowerCase();
    }

    function fileCategory(file: File): FileCategory {
        if (file.type.startsWith('image/')) return 'image';
        if (file.type.startsWith('video/')) return 'video';
        if (file.type.startsWith('audio/')) return 'audio';
        if (file.type === 'application/pdf') return 'pdf';
        if (file.type.startsWith('text/')) return 'text';
        if (file.type.startsWith('application/')) {
            if (file.type.includes('spreadsheet') || file.type.includes('excel')) return 'spreadsheet';
            if (file.type.includes('zip') || file.type.includes('compressed')) return 'archive';
        }

        const extension = fileExtension(file);
        for (const [category, extensions] of Object.entries(EXTENSION_CATEGORIES)) {
            if (extensions.has(extension)) return category as FileCategory;
        }

        return 'other';
    }

    function fileCategoryIcon(category: FileCategory) {
        switch (category) {
            case 'image':
                return FileImageIcon;
            case 'video':
                return FileVideoIcon;
            case 'audio':
                return FileAudioIcon;
            case 'pdf':
                return FileTextIcon;
            case 'text':
                return FileTextIcon;
            case 'code':
                return FileCodeIcon;
            case 'spreadsheet':
                return FileSpreadsheetIcon;
            case 'archive':
                return FileArchiveIcon;
            default:
                return FileIcon;
        }
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

    function mergeFiles(existing: File[], incoming: File[]): File[] {
        const seen = new Set(existing.map((file) => fileKey(file)));
        const merged = [...existing];
        for (const file of incoming) {
            const key = fileKey(file);
            if (!seen.has(key)) {
                merged.push(file);
                seen.add(key);
            }
        }
        return merged;
    }

    function addFiles(incoming: File[]): void {
        if (!incoming.length) return;
        files = mergeFiles(files, incoming);
    }

    function removeFile(index: number): void {
        files = files.filter((_, i) => i !== index);
    }

    function clearFiles(): void {
        files = [];
    }

    function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }

    async function handleUpload(incoming: File[]): Promise<void> {
        addFiles(incoming);
    }

    async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
        if (typeof CompressionStream === 'undefined') {
            throw new Error('CompressionStream is not supported in this browser.');
        }
        const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new CompressionStream('gzip'));
        const buffer = await new Response(stream).arrayBuffer();
        return new Uint8Array(buffer);
    }

    async function resolvePayload(): Promise<{
        bytes: Uint8Array;
        name: string;
        mime: 'application/json';
        size: number;
        hasText: boolean;
        fileEntries: Array<{ name: string; mime: string; size: number }>;
        fileCount: number;
    }> {
        const trimmedText = textPayload.trim();
        const hasText = trimmedText.length > 0;
        if (!hasText && files.length === 0) {
            throw new Error('Enter text or add at least one file.');
        }

        const fileEntries = await Promise.all(
            files.map(async (file) => {
                const buffer = await file.arrayBuffer();
                return {
                    name: fileLabel(file),
                    mime: file.type || 'application/octet-stream',
                    size: file.size,
                    dataB64: uint8ArrayToBase64(new Uint8Array(buffer))
                };
            })
        );

        const bundle: BundlePayload = {
            version: '1',
            text: hasText ? textPayload : undefined,
            files: fileEntries
        };

        const bundleBytes = new TextEncoder().encode(JSON.stringify(bundle));
        const compressedBytes = await gzipBytes(bundleBytes);
        const totalSize =
            (hasText ? new TextEncoder().encode(textPayload).length : 0) +
            fileEntries.reduce((total, file) => total + file.size, 0);

        const displayName =
            files.length === 1 && !hasText
                ? files[0]?.name || 'secret'
                : files.length
                  ? `Bundle (${files.length} files${hasText ? ', text' : ''})`
                  : 'Text';

        return {
            bytes: compressedBytes,
            name: displayName,
            mime: 'application/json',
            size: totalSize,
            hasText,
            fileEntries: fileEntries.map(({ name, mime, size }) => ({ name, mime, size })),
            fileCount: fileEntries.length
        };
    }

    // Simulate progress based on estimated duration
    function simulateProgress(estimatedMs: number): () => void {
        const startTime = performance.now();
        let animationId: number;
        estimatedTotalMs = estimatedMs;

        function update() {
            const elapsed = performance.now() - startTime;
            elapsedMs = elapsed;
            // Use easing to slow down as we approach 100%
            const rawProgress = Math.min(elapsed / estimatedMs, 0.99);
            progressValue = Math.round(rawProgress * 100);
            if (rawProgress < 1) {
                animationId = requestAnimationFrame(update);
            }
        }

        animationId = requestAnimationFrame(update);

        return () => {
            cancelAnimationFrame(animationId);
            progressValue = 100;
            elapsedMs = estimatedMs;
        };
    }

    async function generatePS(): Promise<void> {
        if (!browser || isGenerating) return;
        error = '';
        lastGeneratedName = '';
        if (lastGeneratedURL) {
            URL.revokeObjectURL(lastGeneratedURL);
        }
        lastGeneratedURL = '';
        progressValue = 0;
        isGenerating = true;

        let stopProgress: (() => void) | null = null;

        try {
            const payload = await resolvePayload();
            const hintValue = hint.trim();
            const passwordValue = password.trim().normalize();
            if (!passwordValue) {
                throw new Error('Enter a password to encrypt.');
            }

            const iterations = currentIterations;
            const kdfConfig = buildKdfConfig(kdfMode, iterations, argon2MemoryKib);

            // Start progress simulation
            stopProgress = simulateProgress(targetDurationMs);

            const { ciphertext, salt, iv } = await encryptBytes(passwordValue, payload.bytes, kdfConfig);

            // Stop progress and set to 100%
            stopProgress();
            stopProgress = null;

            const metadata: PSMetadata = {
                version: '3',
                createdAt: new Date().toISOString(),
                hint: hintValue,
                kdf: {
                    ...kdfConfig,
                    saltB64: uint8ArrayToBase64(salt)
                },
                cipher: {
                    name: 'AES-GCM',
                    ivB64: uint8ArrayToBase64(iv)
                },
                payload: {
                    kind: 'bundle',
                    name: payload.name,
                    mime: payload.mime,
                    size: payload.size,
                    compression: 'gzip',
                    fileCount: payload.fileCount,
                    hasText: payload.hasText,
                    entries: payload.fileEntries
                }
            };

            const html = await buildPSHtml(metadata, uint8ArrayToBase64(ciphertext));
            const outputName = 'secret.ps.html';
            lastGeneratedName = outputName;
            lastGeneratedURL = URL.createObjectURL(new Blob([html], { type: 'text/html' }));

            // auto-download the html.
            const link = document.createElement('a');
            link.href = lastGeneratedURL;
            link.download = lastGeneratedName;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Unable to generate the PS.';
        } finally {
            if (stopProgress) stopProgress();
            isGenerating = false;
            // Reset progress after a brief delay to show completion
            setTimeout(() => {
                if (!isGenerating) {
                    progressValue = 0;
                    elapsedMs = 0;
                    estimatedTotalMs = 0;
                }
            }, 500);
        }
    }

    async function onsubmit(event: SubmitEvent): Promise<void> {
        event.preventDefault();
        await generatePS();
    }
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={pageDescription} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={pageUrl} />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:site_name" content={COMPANY_NAME} />
    <meta name="twitter:card" content="summary" />
    <meta property="og:description" content={pageDescription} />
    <meta property="og:image" content="https://{LANDING_HOSTNAME}/og/alcazar-clean.png" />
</svelte:head>

<header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
    <div class="flex w-full items-start gap-4 md:gap-8">
        <a class="shrink-0" href={landingUrl}>
            <div class="group relative">
                <PSLogoSquare rounded="very" sizePx={64} />
                <div class="absolute inset-0 z-10 hidden items-center justify-center group-hover:flex">
                    <CompanyLogoSquare rounded="very" sizePx={64} />
                </div>
            </div>
        </a>
        <div class="w-full">
            <h1 class="text-foreground text-3xl font-semibold">{pageTitle}</h1>
            <p class="text-muted-foreground text-sm text-balance">{pageDescription}</p>
        </div>
    </div>
</header>

{#if browser}
    <div
        role="status"
        class={cn(
            'rounded-lg border px-4 py-3 text-sm font-medium',
            isOnline
                ? 'border-red-600/70 bg-red-500/15 text-red-800'
                : isLocalFile
                  ? 'border-emerald-600/60 bg-emerald-500/15 text-emerald-800'
                  : 'border-amber-500/70 bg-amber-500/15 text-amber-800'
        )}
    >
        {#if isOnline}
            You're connected to the internet. Before typing the password, turn off the internet connection.
        {:else if isLocalFile}
            You're running this page locally and you're offline. Your secrets never leave this device.
        {:else}
            You're offline. Consider also saving this page and opening it locally.
        {/if}
    </div>
{/if}

<form {onsubmit}>
    <Field.Set class="bg-accent rounded-2xl p-6">
        <Field.Field>
            <Field.Label for="ps-text">Secret message and files</Field.Label>
            <FileDropZone.Root onUpload={handleUpload} fileCount={files.length}>
                <div class="bg-white flex flex-col gap-3 rounded-md border p-3 shadow-xs">
                    {#if files.length}
                        <div transition:slide={{ duration: 200 }} class="flex flex-wrap gap-2 px-1">
                            {#each files as file, index (fileKey(file))}
                                {@const category = fileCategory(file)}
                                {@const Icon = fileCategoryIcon(category)}
                                <div
                                    class="group bg-muted/50 relative flex size-14 items-center justify-center overflow-hidden rounded-md border border-transparent"
                                    title={fileLabel(file)}
                                >
                                    {#if category === 'image'}
                                        <img
                                            src={URL.createObjectURL(file)}
                                            alt={fileLabel(file)}
                                            class="size-full object-cover"
                                        />
                                    {:else}
                                        <Icon class="text-muted-foreground size-6" />
                                    {/if}
                                    <Button
                                        size="icon"
                                        variant="secondary"
                                        onclick={() => removeFile(index)}
                                        class="absolute -top-1.5 -right-1.5 size-5 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                                    >
                                        <XIcon class="size-3" />
                                    </Button>
                                </div>
                            {/each}
                        </div>
                    {/if}
                    <FileDropZone.Textarea>
                        {#snippet child({ props })}
                            <textarea
                                {...props}
                                id="ps-text"
                                bind:value={textPayload}
                                placeholder="Type a message or add file attachments."
                                class="placeholder:text-muted-foreground min-h-[44px] w-full border-0 bg-white p-0 text-sm focus-visible:ring-0"
                                rows={2}
                            ></textarea>
                        {/snippet}
                    </FileDropZone.Textarea>
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2">
                            <FileDropZone.Trigger
                                class={cn(
                                    buttonVariants({ variant: 'ghost', size: 'icon' }),
                                    'bg-accent size-8 cursor-pointer'
                                )}
                            >
                                <PaperclipIcon class="text-muted-foreground size-5" />
                            </FileDropZone.Trigger>
                        </div>
                        {#if files.length}
                            <Button type="button" variant="outline" class="h-7 px-2 text-xs" onclick={clearFiles}>
                                Clear
                            </Button>
                        {/if}
                    </div>
                </div>
            </FileDropZone.Root>
        </Field.Field>

        <Field.Field>
            <Field.Label for="ps-hint">Password hint</Field.Label>
            <Textarea
                id="ps-hint"
                bind:value={hint}
                rows={2}
                class="bg-white"
                placeholder={'A yellow elongated fruit (technically a berry!)\n6 letters, all lowercase.'}
            />
        </Field.Field>

        <Field.Group class="md:flex-row md:items-end">
            <Field.Field>
                <Field.Label for="ps-password-input">Password</Field.Label>
                <InputGroup.Root class="bg-white">
                    <InputGroup.Input
                        id="ps-password-input"
                        type={passwordVisible ? 'text' : 'password'}
                        bind:value={password}
                        placeholder="banana"
                        required
                    />
                    <InputGroup.Addon align="inline-end">
                        <Toggle
                            aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                            bind:pressed={passwordVisible}
                            class="text-muted-foreground hover:text-accent-foreground size-6 min-w-0 p-0 hover:bg-transparent! data-[state=on]:bg-transparent"
                        >
                            {#if passwordVisible}
                                <EyeOffIcon class="size-4" />
                            {:else}
                                <EyeIcon class="size-4" />
                            {/if}
                        </Toggle>
                    </InputGroup.Addon>
                </InputGroup.Root>
            </Field.Field>
            <Button type="submit" class="justify-self-end" disabled={isGenerating || !baseline}>
                {#if !baseline}
                    Calibrating…
                {:else if isGenerating}
                    Encrypting…
                {:else}
                    Encrypt <span class="text-primary-foreground/80 ml-1 text-xs font-normal"
                        >~{formatDurationCompact(targetDurationMs)}</span
                    >
                {/if}
            </Button>
        </Field.Group>

        <Collapsible.Root bind:open={advancedOpen} class="flex flex-col gap-4">
            <Collapsible.Trigger
                class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition-colors"
            >
                <ChevronDownIcon class="size-4 transition-transform duration-200 {advancedOpen ? 'rotate-180' : ''}" />
                Advanced settings
            </Collapsible.Trigger>
            <Collapsible.Content class="ml-4">
                <Field.Set>
                    <Field.Description>
                        {#if baseline && baselineMode === kdfMode}
                            {#if kdfMode === 'pbkdf2'}
                                PBKDF2 {PBKDF2_HASH}
                                {currentIterations.toLocaleString()} iterations (~{formatDuration(targetDurationMs)})
                            {:else}
                                Argon2id m={formatBytes(argon2MemoryKib * 1000)}, t={currentIterations}, p={ARGON2_PARALLELISM}
                                (~{formatDuration(targetDurationMs)})
                            {/if}
                        {:else}
                            Calibrating {kdfMode === 'pbkdf2' ? 'PBKDF2' : 'Argon2id'} performance…
                        {/if}
                    </Field.Description>
                    <Field.Field>
                        <Field.Content>
                            <Field.Label>Key derivation</Field.Label>
                            <Field.Description>
                                Argon2id is stronger. PBKDF2 is browser native and results in a smaller HTML file.
                            </Field.Description>
                        </Field.Content>
                        <Select.Root
                            type="single"
                            value={kdfMode}
                            onValueChange={(v) => {
                                if (v === 'argon2id' || v === 'pbkdf2') kdfMode = v;
                            }}
                        >
                            <Select.Trigger class="bg-white max-w-min">
                                {selectedKdfLabel}
                            </Select.Trigger>
                            <Select.Content class="bg-white">
                                {#each KDF_OPTIONS as option}
                                    <Select.Item value={option.value}>{option.label}</Select.Item>
                                {/each}
                            </Select.Content>
                        </Select.Root>
                    </Field.Field>
                    <Field.Field>
                        <Field.Content>
                            <Field.Label>Target derivation time</Field.Label>
                            <Field.Description>
                                Longer derivation time makes brute-force attacks harder but increases decryption time.
                            </Field.Description>
                        </Field.Content>
                        <Select.Root
                            type="single"
                            value={String(targetDurationMs)}
                            onValueChange={(v) => {
                                if (v) targetDurationMs = Number(v);
                            }}
                        >
                            <Select.Trigger class="bg-white max-w-min">
                                {selectedDurationLabel}
                            </Select.Trigger>
                            <Select.Content class="bg-white">
                                {#each DURATION_OPTIONS as option}
                                    <Select.Item value={String(option.value)}>
                                        {option.label}
                                    </Select.Item>
                                {/each}
                            </Select.Content>
                        </Select.Root>
                    </Field.Field>
                    {#if kdfMode === 'argon2id'}
                        <Field.Field>
                            <Field.Content>
                                <Field.Label>Argon2 memory</Field.Label>
                                <Field.Description>
                                    Higher memory increases resistance to brute-force but may clog the RAM on small
                                    devices.
                                </Field.Description>
                            </Field.Content>
                            <Select.Root
                                type="single"
                                value={String(argon2MemoryKib)}
                                onValueChange={(v) => {
                                    if (v) argon2MemoryKib = Number(v);
                                }}
                            >
                                <Select.Trigger class="bg-white max-w-min">
                                    {selectedArgon2MemoryLabel}
                                </Select.Trigger>
                                <Select.Content class="bg-white">
                                    {#each ARGON2_MEMORY_OPTIONS as option}
                                        <Select.Item value={String(option.value)}>
                                            {option.label}
                                        </Select.Item>
                                    {/each}
                                </Select.Content>
                            </Select.Root>
                        </Field.Field>
                    {/if}
                </Field.Set>
            </Collapsible.Content>
        </Collapsible.Root>

        {#if lastGeneratedName && lastGeneratedURL}
            <Field.Description>
                Download
                <a href={lastGeneratedURL} download={lastGeneratedName}>
                    {lastGeneratedName}
                </a>
            </Field.Description>
        {/if}
        {#if error}
            <Field.Description class="text-destructive">{error}</Field.Description>
        {/if}
        {#if isGenerating}
            <div class="flex flex-col gap-1">
                <Progress value={progressValue} max={100} class="h-2" />
                <div class="text-muted-foreground flex justify-between text-xs">
                    <span>{formatDurationCompact(elapsedMs)} elapsed</span>
                    <span>{formatDurationCompact(remainingMs)} remaining</span>
                </div>
            </div>
        {/if}
    </Field.Set>
</form>

<section class="flex flex-col gap-3 pt-4">
    <h2 class="text-primary text-xl font-semibold tracking-widest" id="faq">
        <a href="#faq">FAQ</a>
    </h2>
    <div class="prose prose-sm max-w-none">
        <FAQ />
    </div>
</section>

<hr />
<footer class="flex flex-col gap-4 py-2 sm:flex-row sm:items-center sm:justify-between">
    <a
        href={landingUrl}
        aria-label="Alcazar Security"
        class="w-fit transition-opacity hover:opacity-80"
    >
        <CompanyLogoLong invertColors={true} />
    </a>
    <nav aria-label="Other Alcazar products" class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        {#each footerProducts as product}
            <a href={product.href} class="text-muted-foreground transition-colors hover:text-foreground">
                {product.label}
            </a>
        {/each}
    </nav>
</footer>
