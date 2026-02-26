<script lang="ts">
    import { cn } from '$lib/utils.js';
    import type { HTMLAttributes } from 'svelte/elements';

    let { class: className, children, ...restProps }: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p
    data-slot="field-description"
    class={cn(
        'text-muted-foreground text-sm leading-normal font-normal group-has-[[data-orientation=horizontal]]/field:text-balance',
        'last:mt-0 nth-last-2:-mt-1 [[data-variant=legend]+&]:-mt-1.5',
        '[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4',
        className
    )}
    {...restProps}
>
    {@render children?.()}
</p>
