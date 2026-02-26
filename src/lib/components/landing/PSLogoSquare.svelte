<script lang="ts">
    const defaultSize = 64;
    const {
        rounded,
        sizePx = defaultSize,
        invertColors = false
    }: {
        rounded: 'very' | 'small';
        sizePx?: number;
        invertColors?: boolean;
    } = $props();
    const radius = $derived(rounded === 'very' ? 19.63 : 11.63);
    const fillColor = $derived(invertColors ? 'var(--primary-foreground)' : 'var(--primary)');
    const strokeColor = $derived(invertColors ? 'var(--primary)' : 'var(--primary-foreground)');
</script>

<svg width={sizePx} height={sizePx} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="64" height="64" rx={radius} fill={fillColor} />
    <rect x="12.125" y="16.25" width="39.875" height="31.375" rx="2.5" fill={strokeColor} />
    <path
        d="M28.25 32.625H35.75V30.25C35.75 28.1789 34.0711 26.5 32 26.5C29.9289 26.5 28.25 28.1789 28.25 30.25V32.625ZM32.0156 36.5C31.3253 36.5 30.7656 37.0596 30.7656 37.75C30.7656 38.1668 30.9705 38.5346 31.2842 38.7617L30.5 41.1875H33.5312L32.7461 38.7617C33.06 38.5346 33.2656 38.167 33.2656 37.75C33.2656 37.1029 32.7737 36.571 32.1436 36.5068L32.0156 36.5ZM38.25 32.666C39.6689 32.904 40.75 34.1385 40.75 35.625V42.125C40.75 43.7819 39.4069 45.125 37.75 45.125H26.25C24.5931 45.125 23.25 43.7819 23.25 42.125V35.625C23.25 34.1385 24.3311 32.904 25.75 32.666V30.25C25.75 26.7982 28.5482 24 32 24C35.4518 24 38.25 26.7982 38.25 30.25V32.666Z"
        fill={fillColor}
    />
    <rect x="12.125" y="21" width="39.875" height="0.625" fill={fillColor} />
    <circle cx="14.4375" cy="18.5625" r="0.9375" fill={fillColor} />
    <circle cx="17.1875" cy="18.5625" r="0.9375" fill={fillColor} />
    <circle cx="19.9375" cy="18.5625" r="0.9375" fill={fillColor} />
</svg>
