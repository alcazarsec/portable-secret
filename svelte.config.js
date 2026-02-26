import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import mdsvexConfig from './mdsvex.config.js';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    extensions: ['.svelte', ...mdsvexConfig.extensions],
    preprocess: [vitePreprocess(), mdsvex(mdsvexConfig)],
    kit: {
        adapter: adapter({
            pages: 'build',
            assets: 'build',
            fallback: 'index.html',
            precompress: false,
            strict: true
        }),
        prerender: {
            entries: ['/'],
            handleHttpError: 'fail'
        },
        output: {
            bundleStrategy: 'inline'
        }
    }
};

export default config;
