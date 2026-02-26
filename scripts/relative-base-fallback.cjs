/**
 * After adapter-static writes the fallback index.html, replace baked-in base/assets
 * with runtime resolution so the same HTML works when opened from file:// (no redirect loop).
 */
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const htmlPath = join(process.cwd(), 'build', 'index.html');
const expr = 'new URL(".", location).pathname.slice(0, -1)';

let html = readFileSync(htmlPath, 'utf-8');
html = html.replace(/\bbase:\s*"\/[^"]*"/g, `base: ${expr}`);
html = html.replace(/\bassets:\s*"\/[^"]*"/g, `assets: ${expr}`);
writeFileSync(htmlPath, html);
