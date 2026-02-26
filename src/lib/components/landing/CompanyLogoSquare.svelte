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
    <path
        d="M51.937 41.18H42.5239L37.8472 51.0335H26.0757L21.3989 41.18H12.063L25.4819 12.9036H38.5181L51.937 41.18ZM24.8062 35.3333H27.5386L31.9604 44.6516L36.3833 35.3333H39.1938L31.9995 20.1741L24.8062 35.3333Z"
        fill={strokeColor}
    />
</svg>
