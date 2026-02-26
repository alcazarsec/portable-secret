/**
 * After adapter-static writes the fallback index.html, replace baked-in base/assets
 * with runtime resolution so the same HTML works when opened from file:// (no redirect loop).
 * When opened as a file (file:// with pathname like .../file.html), use full pathname as base
 * so the route path is "/" and the app loads; otherwise use directory of document.
 */
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const htmlPath = join(process.cwd(), 'build', 'index.html');
const expr = '(function(){var p=location.pathname;if(location.protocol==="file:"&&p.lastIndexOf(".")>p.lastIndexOf("/"))return p;var i=p.lastIndexOf("/");return i<=0?p||"":p.slice(0,i);})()';

let html = readFileSync(htmlPath, 'utf-8');
html = html.replace(/\bbase:\s*"\/[^"]*"/g, `base: ${expr}`);
html = html.replace(/\bassets:\s*"\/[^"]*"/g, `assets: ${expr}`);
writeFileSync(htmlPath, html);
