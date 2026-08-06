// ラーメン・パン屋の全島スイープ分を shops 配列に追加する
const fs = require('fs');
const P = 'C:/Users/kinta/hichan-map/index.html';
const cands = require('./cand_ramenpan.js');
const geo = require('./geo_ramenpan.json');
const OVERRIDE = require('./override_ramenpan.js');

const T = (cls, txt) => `<span class="tag tag-${cls}">${txt}</span>`;
const esc = s => String(s).replace(/'/g, "\\'");

const rows = cands.map((c, i) => {
  const [area_id, n, g, a, addr, tb, tbc, d, r, h, tags] = c;
  const o = OVERRIDE[n];
  if (!o && !geo[i].banchi) throw new Error('座標未解決かつ override 無し: ' + n + ' / ' + addr);
  const lat = o ? o.lat : geo[i].lat;
  const lng = o ? o.lng : geo[i].lng;
  if (!lat || !lng) throw new Error('座標が空: ' + n);
  return { n, g, a, area_id, lat: +lat.toFixed(6), lng: +lng.toFixed(6), tb, tbc, d, r, h, tags: tags.map(t => T(t[0], t[1])).join('') };
});

// 同一座標が3件以上重なったら（同じ施設でない限り）気づけるように出しておく
const byPos = {};
rows.forEach(r => (byPos[r.lat + '_' + r.lng] = byPos[r.lat + '_' + r.lng] || []).push(r.n));
Object.entries(byPos).filter(([, v]) => v.length > 1).forEach(([k, v]) => console.log('同一座標: ' + k + ' → ' + v.join(' / ')));

const lines = rows.map(r =>
  `  {n:'${esc(r.n)}',g:'${r.g}',a:'${esc(r.a)}',area_id:'${r.area_id}',lat:${r.lat},lng:${r.lng},` +
  (r.tb ? `tb:${r.tb},tbc:${r.tbc},` : '') +
  `d:'${esc(r.d)}',r:'${esc(r.r)}',h:'${esc(r.h)}',tags:'${r.tags}',badges:''},`
).join('\n');

let h = fs.readFileSync(P, 'utf8');
const before = h;
const cm = h.match(/\r?\n\];\r?\n\r?\nconst AREA_META/);
if (!cm) throw new Error('array close not found');
const nl = cm[0].startsWith('\r\n') ? '\r\n' : '\n';
const at = cm.index + nl.length;
h = h.slice(0, at) + lines.split('\n').join(nl) + nl + h.slice(at);
if (h === before) throw new Error('no change');
fs.writeFileSync(P, h, 'utf8');

const byGenre = {};
rows.forEach(r => byGenre[r.g] = (byGenre[r.g] || 0) + 1);
console.log('追加:', rows.length, JSON.stringify(byGenre));
