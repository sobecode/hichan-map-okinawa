// 新エリア「やんばる」「中城・北中城」を新設し、既存3店を移し、新規73店を追加する
const fs = require('fs');
const P = 'C:/Users/kinta/hichan-map/index.html';
const cands = require('./cand_batch1.js');
const geo = require('./geo_batch1.json');

// GSIが番地を持たなかった店の座標（OSM / マピオン番地ページ / マピオン電話帳）
const OVERRIDE = {
  // 国頭村
  '国頭港食堂':            [26.721223, 128.158462], // OSM
  'サーフサイドカフェ':    [26.736421, 128.160242], // OSM JALプライベートリゾートオクマ（奥間913）
  'いじゅ':                [26.736421, 128.160242],
  '阿檀':                  [26.736421, 128.160242],
  'おかめ':                [26.736421, 128.160242],
  'OASIS':                 [26.736421, 128.160242],
  '潮風のラウンジ':        [26.736421, 128.160242],
  'わぁ～家～':            [26.732076, 128.169149], // マピオン 奥間1605（道の駅ゆいゆい国頭）
  'レストランくいな':      [26.732076, 128.169149],
  'サーター屋':            [26.732076, 128.169149],
  'ヒルバレージュニア':    [26.732076, 128.169149],
  'ユイカフェ':            [26.732076, 128.169149],
  'とっくり屋':            [26.732682, 128.161648], // マピオン 鏡地272
  'ふしくぶ':              [26.872495, 128.263257], // OSM
  '辺戸岬こうようパーラー':[26.872056, 128.263590], // OSM
  '食事処 みーやー':       [26.732218, 128.170495], // マピオン 奥間1704
  'やまびこ':              [26.739899, 128.174814], // OSM 食堂やまびこ
  // 大宜味村
  '笑味の店':                      [26.702795, 128.123510], // マピオン 大兼久61
  '前田食堂':                      [26.653386, 128.091492], // マピオン電話帳
  'レストランやんばるシーサイド':  [26.660972, 128.102339], // OSM
  '江洲の花':                      [26.641172, 128.126704], // OSM
  'ぶながや食堂':                  [26.690213, 128.107943], // マピオン 根路銘1373
  'パーラーくがに':                [26.660670, 128.102403], // OSM
  'OKINAWA CACAO Factory&Cafe':    [26.711412, 128.162715], // マピオン 田嘉里555
  'おおぎみ食堂':                  [26.701857, 128.116773], // マピオン電話帳
  'まぁぐすくやー':                [26.672410, 128.108590], // マピオン 塩屋352
  'がじまんろー':                  [26.688150, 128.128238], // マピオン 大宜味923
  '小春屋':                        [26.703333, 128.149518], // OSM「小春や」（喜如嘉2348の隣、字一致）
  'やんばる横町':                  [26.705284, 128.135984], // マピオン 喜如嘉50
  'レストラン マリン':             [26.661619, 128.096716], // マピオン 津波290
  // 東村
  'ヒロ コーヒーファーム': [26.663546, 128.248798], // OSM
  '又吉コーヒー園':        [26.609834, 128.143900], // OSM
  '食事処 東ぬ浜':         [26.630800, 128.153323], // OSM
  '森のふくろう':          [26.614257, 128.115038], // マピオン 有銘358
  'あいうえお':            [26.603171, 128.144154], // OSM あいうえお食事
  // 北中城村・中城村
  'サムズ カフェ':           [26.297212, 127.779436], // OSM
  'ロハス・ガーデン 樹々':   [26.258337, 127.777111], // マピオン電話帳
  'きなこや':                [26.278672, 127.803465], // マピオン 泊96
  'くわっちぃやー':          [26.259393, 127.788483], // マピオン 安里220
  'なかとみ':                [26.257140, 127.775256], // マピオン 南上原162
  'レインボーコーヒー 中城店':[26.250671, 127.774195], // マピオン電話帳
};
// 住所がどこにも公開されていない／番地が引けない店は入れない（前例どおり見送り）
const SKIP = new Set(['かねやん食堂']);

const esc = s => s.replace(/'/g, "\\'");
const lines = [];
let skipped = [];
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

// 既存店の付け替え
let moved = 0;
h = h.split('\n').map(line => {
  if (!/^\s*\{n:/.test(line)) return line;
  if (/a:'国頭村/.test(line) && /area_id:'nago'/.test(line)) { moved++; return line.replace("area_id:'nago'", "area_id:'yanbaru'"); }
  if (/a:'北中城村/.test(line) && /area_id:'okinawacity'/.test(line)) { moved++; return line.replace("area_id:'okinawacity'", "area_id:'nakagusuku'"); }
  return line;
}).join('\n');

// AREA_META / AREA_ORDER / ナビボタン
h = h.replace("  nago:['🌿','名護・北部'],", "  yanbaru:['🌳','やんばる'], nago:['🌿','名護・北部'],");
h = h.replace("okinawacity:['🎠','沖縄市・中部'],", "okinawacity:['🎠','沖縄市・中部'], nakagusuku:['🛒','中城・北中城'],");
h = h.replace("const AREA_ORDER = ['nago'", "const AREA_ORDER = ['yanbaru','nago'");
h = h.replace("'okinawacity','tomigusuku'", "'okinawacity','nakagusuku','tomigusuku'");
h = h.replace(`<button class="area-btn" onclick="jumpTo('nago',`,
  `<button class="area-btn" onclick="jumpTo('yanbaru',26.72,128.16,11,this)">🌳 やんばる</button>\n    <button class="area-btn" onclick="jumpTo('nago',`);
h = h.replace(`<button class="area-btn" onclick="jumpTo('tomigusuku',`,
  `<button class="area-btn" onclick="jumpTo('nakagusuku',26.28,127.79,13,this)">🛒 中城・北中城</button>\n    <button class="area-btn" onclick="jumpTo('tomigusuku',`);
// okinawacity から北中城村が抜けたので注記を更新
h = h.replace('  // okinawacity は北中城村の店も含むため「沖縄市・中部」表記\n', '');
h = h.replace('  // okinawacity は北中城村の店も含むため「沖縄市・中部」表記\r\n', '');

fs.writeFileSync(P, h, 'utf8');
console.log('added:', lines.length, '/ moved:', moved, '/ skipped:', skipped.join(', ') || 'なし');
