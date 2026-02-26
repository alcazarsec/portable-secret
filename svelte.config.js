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
            precompress: false,
            strict: true
        }),
        paths: {
            base: process.argv.includes('dev') ? '' : process.env.BASE_PATH,
            // Use runtime-relative base/assets in prerendered pages for file:// portability
            relative: true
        },
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
