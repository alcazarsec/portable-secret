<script lang="ts">
    import '../app.css';
    let { children } = $props();
</script>

<div class="bg-background flex min-h-screen w-full flex-col items-center p-4 md:px-8 md:py-8 xl:px-16">
    <main class="flex w-full max-w-2xl flex-1 flex-col gap-8">
        {@render children()}
    </main>
</div>
