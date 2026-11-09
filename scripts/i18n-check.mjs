// Vérifie que chaque texte t('…') de l'appli a une traduction dans toutes les langues.
// Usage : npm run i18n:check
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? (p.includes('i18n') || walk(p)) : /\.tsx?$/.test(f) && files.push(p); });
walk('src');
const keys = new Set();
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)+)\1/g)) keys.add(m[2].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n'));
}
let missing = 0;
for (const lang of ['en', 'es', 'pt', 'de', 'it']) {
  const src = readFileSync(`src/i18n/${lang}.ts`, 'utf8');
  const dict = new Set([...src.matchAll(/^\s+("(?:\\.|[^"\\])*"):/gm)].map((m) => JSON.parse(m[1])));
  const miss = [...keys].filter((k) => !dict.has(k) && /[A-Za-zÀ-ÿ]/.test(k) && !['2-digit', 'long', 'numeric', 'short'].includes(k));
  if (miss.length) { missing += miss.length; console.log(`\n[${lang}] ${miss.length} manquant(s) :`); miss.forEach((k) => console.log('  -', k)); }
}
console.log(missing ? `\n${missing} traduction(s) manquante(s).` : `OK : ${keys.size} textes traduits dans toutes les langues.`);
process.exit(missing ? 1 : 0);
