// タイトルロゴ assets/logo.png を作る：node tests/make-logo.js
// SVGで「たけとサイの／大冒険」の2段組み・厚み・金の縁・紋章（剣・宝珠・アユタヤの塔）を描き、PNGに書き出す。
// 文字は Google Fonts の「Dela Gothic One」（SIL Open Font License）を使う（作るときだけネットから読む。ゲームはPNGだけを使う）。
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const OUT = path.join(__dirname, '..', 'assets', 'logo.png');
const W = 1000, H = 640;

// 1文字ずつ置く（弧を描くように少し上下・回転させて勢いを出す）
function chars(text, cx, baseY, size, spacing, arc, tilt) {
  const n = text.length, out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) * 2 - 1;          // -1..1
    const x = cx + (i - (n - 1) / 2) * spacing;
    const y = baseY - arc * (1 - t * t);
    out.push({ ch: text[i], x, y, size, rot: t * tilt });
  }
  return out;
}
const UP = chars('たけとサイの', 500, 318, 112, 116, 16, 5);
const DOWN = chars('大冒険', 500, 565, 238, 262, 26, 6);

function layer(list, attrs) {
  return list.map((c) => `<text x="${c.x}" y="${c.y}" font-size="${c.size}" transform="rotate(${c.rot.toFixed(2)} ${c.x} ${c.y - c.size * 0.35})" ${attrs}>${c.ch}</text>`).join('');
}
function word(list, grad) {
  const z = list[0].size, depth = Math.round(z / 16);
  let s = '';
  // 厚み（下にずらした濃い青を重ねる）
  for (let k = depth; k >= 1; k--) s += `<g transform="translate(${k * 0.3},${k})">${layer(list, `fill="#081638" stroke="#081638" stroke-width="${z * 0.16}" stroke-linejoin="round"`)}</g>`;
  s += layer(list, `fill="none" stroke="#0a1a44" stroke-width="${z * 0.16}" stroke-linejoin="round"`);   // 外側の濃い縁
  s += layer(list, `fill="none" stroke="url(#gold)" stroke-width="${z * 0.075}" stroke-linejoin="round"`); // 金の縁
  s += layer(list, `fill="url(#${grad})"`);                                                          // 白→青
  s += layer(list, `fill="url(#gloss)"`);                                                            // 上半分のつや
  s += layer(list, `fill="none" stroke="#0a1a44" stroke-width="${z * 0.022}" stroke-linejoin="round"`); // 文字の輪郭（すき間をくっきり）
  return s;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="blueA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.42" stop-color="#d8f0ff"/><stop offset="0.62" stop-color="#5aa8f0"/><stop offset="1" stop-color="#1a4ab8"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c0"/><stop offset="0.45" stop-color="#f4c838"/><stop offset="1" stop-color="#a86a10"/></linearGradient>
  <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="0.4" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
  <linearGradient id="prang" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff0a8"/><stop offset="0.45" stop-color="#e8b630"/><stop offset="1" stop-color="#8a5a10"/></linearGradient>
  <linearGradient id="blade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#cfe0f0"/><stop offset="0.51" stop-color="#8aa0b8"/><stop offset="1" stop-color="#b8c8dc"/></linearGradient>
  <radialGradient id="orb" cx="0.38" cy="0.35" r="0.7"><stop offset="0" stop-color="#e8fffc"/><stop offset="0.3" stop-color="#5ff0e0"/><stop offset="1" stop-color="#0a7a80"/></radialGradient>
  <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff2b0" stop-opacity="0.9"/><stop offset="0.5" stop-color="#ffd860" stop-opacity="0.35"/><stop offset="1" stop-color="#ffd860" stop-opacity="0"/></radialGradient>
</defs>
<g font-family="'Dela Gothic One'" text-anchor="middle">
  <!-- 紋章：光・アユタヤの塔（プラーン）・剣・宝珠 -->
  <g transform="translate(500,178) scale(0.92)">
    <circle r="138" fill="url(#halo)"/>
    ${Array.from({ length: 20 }, (_, i) => { const a = (i / 20 - 0.25) * Math.PI * 2, r1 = 50, r2 = i % 2 ? 108 : 136, w = 0.09;
      return `<path d="M${(Math.cos(a - w) * r1).toFixed(1)},${(Math.sin(a - w) * r1).toFixed(1)} L${(Math.cos(a) * r2).toFixed(1)},${(Math.sin(a) * r2).toFixed(1)} L${(Math.cos(a + w) * r1).toFixed(1)},${(Math.sin(a + w) * r1).toFixed(1)}Z" fill="#ffe88a" opacity="0.7"/>`; }).join('')}
    <!-- 塔：段々の基壇・とうもろこし形の塔身・尖塔 -->
    <path d="M-104,112 L-104,86 L-86,86 L-86,62 L-66,62 L-66,40 L-52,40
             C-54,8 -50,-30 -40,-58 C-32,-82 -20,-100 -12,-112 L-6,-134 L0,-168 L6,-134 L12,-112
             C20,-100 32,-82 40,-58 C50,-30 54,8 52,40 L66,40 L66,62 L86,62 L86,86 L104,86 L104,112 Z"
          fill="url(#prang)" stroke="#3a2406" stroke-width="6" stroke-linejoin="round"/>
    <path d="M-50,14 L50,14 M-46,-16 L46,-16 M-38,-44 L38,-44 M-26,-72 L26,-72 M-14,-98 L14,-98 M-66,40 L66,40 M-86,62 L86,62 M-104,86 L104,86"
          stroke="#7a4e0c" stroke-width="4"/>
    ${[-1, 1].map((d) => [14, -16, -44, -72].map((y, i) => `<path d="M${d * (50 - i * 6)},${y} q${d * 10},-8 ${d * 2},-20" fill="none" stroke="#7a4e0c" stroke-width="4"/>`).join('')).join('')}
    <path d="M-22,112 L-22,74 Q0,52 22,74 L22,112 Z" fill="#2a1804"/>
    <!-- 剣（塔の前に立てる）と宝珠のつば -->
    <path d="M0,-150 L11,-128 L11,30 L-11,30 L-11,-128 Z" fill="url(#blade)" stroke="#1a2440" stroke-width="5" stroke-linejoin="round"/>
    <path d="M-70,26 Q-40,44 -16,36 L16,36 Q40,44 70,26 Q60,50 16,54 L-16,54 Q-60,50 -70,26 Z" fill="url(#gold)" stroke="#3a2406" stroke-width="5" stroke-linejoin="round"/>
    <rect x="-9" y="58" width="18" height="34" rx="3" fill="#7a4420" stroke="#2a1406" stroke-width="5"/>
    <circle cx="0" cy="45" r="21" fill="url(#orb)" stroke="#06343a" stroke-width="5"/>
    <circle cx="-7" cy="38" r="5" fill="#ffffff" opacity="0.9"/>
  </g>
  ${word(UP, 'blueA')}
  ${word(DOWN, 'blueA')}
</g>
</svg>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  // フォントは curl で取得して埋め込む（ロゴに使う文字だけの小さなファイル）
  const text = encodeURIComponent('たけとサイの大冒険');
  const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
  const css = execFileSync('curl', ['-sS', '-m', '30', '-A', UA, `https://fonts.googleapis.com/css2?family=Dela+Gothic+One&text=${text}`]).toString();
  const url = (css.match(/url\((https:[^)]+)\)/) || [])[1];
  if (!url) throw new Error('font css not found');
  const font = execFileSync('curl', ['-sS', '-m', '30', url]);
  await p.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: 'Dela Gothic One'; src: url(data:font/woff2;base64,${font.toString('base64')}) format('woff2'); }
    html,body{margin:0;background:transparent}</style></head><body>${svg}</body></html>`);
  await p.evaluate(async () => { await document.fonts.load("100px 'Dela Gothic One'", 'たけとサイの大冒険'); await document.fonts.ready; });
  const ok = await p.evaluate(() => [...document.fonts].some((f) => f.family.includes('Dela') && f.status === 'loaded'));
  if (!ok) throw new Error('font not loaded');
  await p.locator('svg').screenshot({ path: OUT, omitBackground: true });
  await b.close();
  console.log('assets/logo.png written', fs.statSync(OUT).size, 'bytes');
})();
