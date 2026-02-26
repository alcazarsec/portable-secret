/**
 * After adapter-static writes the fallback index.html, replace baked-in base/assets
 * with runtime resolution so the same HTML works when opened from file:// (no redirect loop).
 * When opened as a file (file:// with pathname like .../file.html), use full pathname as base
 * so the route path is "/" and the app loads; otherwise use directory of document.
 *
 * Also inject a history shim for file:// so Chrome (which rejects replaceState/pushState
 * with a different URL when origin is null) does not throw; we force the URL to
 * location.href so the state still updates and the app works.
 */
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const htmlPath = join(process.cwd(), 'build', 'index.html');
const expr = '(function(){var p=location.pathname;if(location.protocol==="file:"&&p.lastIndexOf(".")>p.lastIndexOf("/"))return p;var i=p.lastIndexOf("/");return i<=0?p||"":p.slice(0,i);})()';

const historyShim = `<script>(function(){if(location.protocol!=="file:")return;var r=history.replaceState.bind(history),p=history.pushState.bind(history);history.replaceState=function(s,t,u){try{r(s,t,u)}catch(e){r(s,t,location.href)}};history.pushState=function(s,t,u){try{p(s,t,u)}catch(e){p(s,t,location.href)}}})();</script>`;

let html = readFileSync(htmlPath, 'utf-8');
html = html.replace(/\bbase:\s*"\/[^"]*"/g, `base: ${expr}`);
html = html.replace(/\bassets:\s*"\/[^"]*"/g, `assets: ${expr}`);
html = html.replace(/(<body[^>]*>)/, `$1\n${historyShim}`);
writeFileSync(htmlPath, html);
