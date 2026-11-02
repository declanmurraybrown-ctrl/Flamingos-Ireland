// Bundles the app into one self-contained HTML file (no server needed).
// Usage: node tools/bundle.mjs [out.html]
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const order = ['analysis', 'demo', 'lines', 'choreography', 'fruit', 'scene', 'main'];
let js = '';
for (const m of order) {
  let src = read(`js/${m}.js`)
    .replace(/^import[^;]+;\s*$/gm, '')
    .replace(/^export\s+/gm, '');
  if (m === 'demo') src = src.replace(/\brng\b/g, 'demoRng');
  js += `\n// ---- ${m}.js ----\n{\n${src}\n${exportsOf(m, src)}\n}\n`;
}
function exportsOf(m, src) {
  // expose each module's top-level names to the shared scope
  const names = [...read(`js/${m}.js`).matchAll(/^export\s+(?:async\s+)?(?:function|const|let)\s+(\w+)/gm)].map((x) => x[1]);
  return names.map((n) => `globalThis.${n} = ${m === 'demo' && n === 'rng' ? 'demoRng' : n};`).join('\n');
}
const css = read('css/style.css');
let html = read('index.html')
  .replace(/<link rel="stylesheet"[^>]*>/, `<style>\n${css}\n</style>`)
  .replace(/<script type="module" src="js\/main.js"><\/script>/, () => `<script type="module">\n${js}\n</script>`);
const out = process.argv[2] || 'fruit-party.html';
writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(0) + ' KB');
