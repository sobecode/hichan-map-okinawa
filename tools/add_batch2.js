// 新エリア「南風原・西原・与那原」「八重瀬」を新設し、既存1店を移し、新規71店を追加する
const fs = require('fs');
const P = 'C:/Users/kinta/hichan-map/index.html';
const cands = require('./cand_batch2.js');
const geo = require('./geo_batch2.json');

// GSIが番地を持たなかった店の座標（マピオン番地ページ／電話帳）
const OVERRIDE = {
  'ムーンテラスカフェ':          [26.212461, 127.768996], // マピオン 西原町東崎22
  'まつどべーかりぃ':            [26.205376, 127.758222], // マピオン 与那原町東浜92
  'らんらん家':                  [26.205501, 127.760100], // マピオン 与那原町東浜87
  'ヨルノアシオト/洋食タロウ':   [26.202296, 127.754531], // マピオン 与那原町与那原601
  '屋宜家':                      [26.127452, 127.736665], // マピオン電話帳
  '古民家食堂 上江門':           [26.120582, 127.731004], // マピオン 八重瀬町安里198
  '新垣珈琲':                    [26.172734, 127.710383], // マピオン 八重瀬町宜次578
  '沖縄そばCafeてんてん':        [26.152328, 127.736631], // マピオン 八重瀬町後原57
  '南国亭':                      [26.116916, 127.716568], // マピオン電話帳
  'ひるぎ':                      [26.149984, 127.703828], // マピオン電話帳
  'KINARI.MODERN BURGER':        [26.115141, 127.730379], // マピオン 八重瀬町仲座24
};
// 番地がGSI・マピオン・OSMのどこにも無い店は入れない（前例どおり見送り）
const SKIP = new Set(['しまぶく家', '古民家食堂', '四季五彩 きわ']);

const esc = s => s.replace(/'/g, "\\'");
const lines = [];
const skipped = [];
cands.forEach((c, i) => {
  const [area, n, g, a, , tb, tbc, d, r, hh, tagspec] = c;
  if (SKIP.has(n)) { skipped.push(n); return; }
  const ov = OVERRIDE[n];
  const lat = ov ? ov[0] : geo[i].lat;
  const lng = ov ? ov[1] : geo[i].lng;
  if (lat == null) throw new Error('座標なし: ' + n);
  if (!ov && !geo[i].banchi) throw new Error('番地未解決なのに override なし: ' + n);
  const tags = tagspec.map(([cls, txt]) => `<span class="tag tag-${cls}">${txt}</span>`).join('');
  lines.push(`  {n:'${esc(n)}',g:'${g}',a:'${a}',area_id:'${area}',lat:${lat},lng:${lng},tb:${tb},tbc:${tbc},` +
    `d:'${esc(d)}',r:'${esc(r)}',h:'${esc(hh)}',tags:'${tags}',badges:''},`);
});

let h = fs.readFileSync(P, 'utf8');
const cm = h.match(/\r?\n\];\r?\n\r?\nconst AREA_META/);
if (!cm) throw new Error('array close not found');
const nl = cm[0].startsWith('\r\n') ? '\r\n' : '\n';
const at = cm.index + nl.length;
h = h.slice(0, at) + lines.join('\n').split('\n').join(nl) + nl + h.slice(at);

// 与那原町の既存店を南城から付け替え
let moved = 0;
h = h.split('\n').map(line => {
  if (/^\s*\{n:/.test(line) && /a:'与那原町/.test(line) && /area_id:'nanjo'/.test(line)) {
    moved++; return line.replace("area_id:'nanjo'", "area_id:'haebaru'");
  }
  return line;
}).join('\n');

// AREA_META / AREA_ORDER / ナビボタン（那覇の東〜南へ続く並びに差し込む）
h = h.replace("  tomigusuku:['🏯','豊見城'],", "  haebaru:['🌾','南風原・西原・与那原'], tomigusuku:['🏯','豊見城'], yaese:['🌿','八重瀬'],");
h = h.replace("'nakagusuku','tomigusuku'", "'nakagusuku','haebaru','tomigusuku'");
h = h.replace("'itoman','nanjo']", "'itoman','yaese','nanjo']");
h = h.replace(`<button class="area-btn" onclick="jumpTo('tomigusuku',`,
  `<button class="area-btn" onclick="jumpTo('haebaru',26.21,127.75,12,this)">🌾 南風原・西原・与那原</button>\n    <button class="area-btn" onclick="jumpTo('tomigusuku',`);
h = h.replace(`<button class="area-btn" onclick="jumpTo('nanjo',`,
  `<button class="area-btn" onclick="jumpTo('yaese',26.14,127.73,13,this)">🌿 八重瀬</button>\n    <button class="area-btn" onclick="jumpTo('nanjo',`);

fs.writeFileSync(P, h, 'utf8');
console.log('added:', lines.length, '/ moved:', moved, '/ skipped:', skipped.join(', ') || 'なし');
