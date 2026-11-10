const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const { execSync } = require('child_process');
const root = process.argv[2];
const svg = fs.readFileSync(process.argv[4] || path.join(root, 'public/logo.svg'), 'utf8').replace('fill="url(#bg)"', 'fill="#ffffff"');
const res = path.join(root, 'android/app/src/main/res');
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const sized = (s) => svg.replace('<svg ', `<svg width="${s}" height="${s}" `);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const shot = async (w, h, html, out) => {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
    await p.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  };
  for (const [d, k] of Object.entries(dens)) {
    const L = Math.round(48 * k), F = Math.round(108 * k);
    await shot(L, L, `<div style="width:${L}px;height:${L}px;border-radius:${L * 0.18}px;overflow:hidden">${sized(L)}</div>`, `${res}/mipmap-${d}/ic_launcher.png`);
    await shot(L, L, `<div style="width:${L}px;height:${L}px;border-radius:50%;overflow:hidden">${sized(L)}</div>`, `${res}/mipmap-${d}/ic_launcher_round.png`);
    const inner = Math.round(F * 0.77), off = (F - inner) / 2;
    await shot(F, F, `<div style="width:${F}px;height:${F}px;background:#ffffff;position:relative"><div style="position:absolute;left:${off}px;top:${off}px">${sized(inner)}</div></div>`, `${res}/mipmap-${d}/ic_launcher_foreground.png`);
  }
  // Écrans de démarrage : fond crème + logo arrondi centré, aux dimensions existantes.
  for (const dir of fs.readdirSync(res).filter((x) => x.startsWith('drawable'))) {
    const f = `${res}/${dir}/splash.png`;
    if (!fs.existsSync(f)) continue;
    const [w, h] = execSync(`python3 -c "from PIL import Image;i=Image.open('${f}');print(*i.size)"`).toString().trim().split(' ').map(Number);
    const s = Math.round(Math.min(w, h) * 0.38);
    await shot(w, h, `<div style="width:${w}px;height:${h}px;background:#ffffff;display:flex;align-items:center;justify-content:center"><div style="width:${s}px;height:${s}px;border-radius:${s * 0.22}px;overflow:hidden;box-shadow:0 ${s * 0.04}px ${s * 0.12}px rgba(120,53,15,.18)">${sized(s)}</div></div>`, f);
  }
  // Aperçu du masque rond Android pour vérification.
  const F = 432, img = fs.readFileSync(`${res}/mipmap-xxxhdpi/ic_launcher_foreground.png`).toString('base64');
  await shot(F, F, `<div style="width:${F}px;height:${F}px;background:#333;display:flex;align-items:center;justify-content:center"><div style="width:${F * 72 / 108}px;height:${F * 72 / 108}px;border-radius:50%;overflow:hidden;position:relative"><img src="data:image/png;base64,${img}" style="position:absolute;left:${-F * 18 / 108}px;top:${-F * 18 / 108}px;width:${F}px"></div></div>`, process.argv[3]);
  await b.close();
})();
