// Écran de démarrage Android en haute définition (une image par densité, jamais étirée).
// Usage : node scripts/android-splash.cjs   (à lancer depuis la racine du dépôt)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const svg = fs.readFileSync(path.join(root, 'android/icon-source.svg'), 'utf8').replace('fill="url(#bg)"', 'fill="#ffffff"');
const res = path.join(root, 'android/app/src/main/res');
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const sized = (s) => svg.replace('<svg ', `<svg width="${s}" height="${s}" `);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (w, html, out) => {
    await p.setViewportSize({ width: w, height: w });
    await p.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await p.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: w, height: w } });
  };
  for (const [d, k] of Object.entries(DENS)) {
    // Android 12+ : icône animée de l'écran de démarrage (288 dp, contenu dans le cercle central de 192 dp).
    const I = Math.round(288 * k);
    const inner = Math.round(I * 0.6);
    await shot(I, `<div style="width:${I}px;height:${I}px;display:flex;align-items:center;justify-content:center">${sized(inner)}</div>`, `${res}/drawable-${d}/splash_icon.png`);
    // Android 11 et moins / transition : logo centré de 160 dp sur fond blanc (sans étirement).
    const L = Math.round(160 * k);
    await shot(L, sized(L), `${res}/drawable-${d}/splash_logo.png`);
  }
  await b.close();
})();
