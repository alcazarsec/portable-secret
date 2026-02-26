import { defineMDSveXConfig } from 'mdsvex';

const config = defineMDSveXConfig({
    extensions: ['.svelte.md', '.md', '.svx'],
    smartypants: { dashes: 'oldschool' },
    remarkPlugins: [],
    rehypePlugins: []
});

export default config;
