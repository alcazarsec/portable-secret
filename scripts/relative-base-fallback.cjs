/**
 * After adapter-static writes the fallback index.html, replace baked-in base/assets
 * with runtime resolution so the same HTML works when opened from file:// (no redirect loop).
 * Derive directory from pathname so it works in both Chrome and Firefox (Firefox does not
 * add trailing slash to file:// directory pathname, so slice(0,-1) would break).
 */
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const htmlPath = join(process.cwd(), 'build', 'index.html');
// Directory of current document: pathname up to last "/"; if no slash or only leading, use pathname (app root)
const expr = '(function(){var p=location.pathname;var i=p.lastIndexOf("/");return i<=0?p||"":p.slice(0,i);})()';

let html = readFileSync(htmlPath, 'utf-8');
html = html.replace(/\bbase:\s*"\/[^"]*"/g, `base: ${expr}`);
html = html.replace(/\bassets:\s*"\/[^"]*"/g, `assets: ${expr}`);
writeFileSync(htmlPath, html);
