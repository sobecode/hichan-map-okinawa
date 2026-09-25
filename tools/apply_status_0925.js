/*
 * 2026-09-25 の食べログ全店点検(tools/tabelog_status.js)の反映。
 *   node tools/apply_status_0925.js [--dry]
 *
 * 1. 記録の訂正(店舗ページを直接見て確認したもの)
 *    - 生け簀の銀次 泡瀬本舗 → 同じ泡瀬2-5-8で「魚がしの銀次 泡瀬店」の昼の食堂に改名
 *      (食べログ 47012258 のタイトルが「魚がしの銀次 泡瀬店 （【旧店名】生け簀の銀次）」)
 *    - KOHAKUIMO は読谷村宇座に店舗が無い。公式・食べログとも那覇市牧志1-4-43 新川ビル1Fのみ
 *    - 新潟発祥ラーメン なおじ 沖縄一号店 は【移転】。移転先は なおじ 豊見城店(豊見城市真玉橋545-2)
 * 2. 営業時間 h が空の店に、食べログの営業時間を縮めて入れる(昼夜バッジが推測から実データになる)
 *    照合が別店に当たっていた組(REJECT)は使わない
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {compactHours} = require('./compact_hours');

const DRY = process.argv.includes('--dry');
const P = path.join(__dirname, '..', 'index.html');
const status = require('./tabelog_status.json');

// 一致0.75の「語の共有」で別の店に当たっていた組。目視で確認
const REJECT = new Set([
  '中国料理 金紗沙',            // → 中国料理 柳翠(閉店)。金紗沙はホテル日航アリビラ内で営業中
  'THE TERRACE BAKERY',          // → MB GALLERY CHATAN by THE TERRACE HOTELS
  'Little Thailand Okinawa',     // → BAR LITTLE REEF
  "Seaside STEAK BEEFY'S",       // → Seaside Cafe Hanon
  '串カツ あしだ屋',             // → 串カツ田中
  'やきとり イツトヨツ',         // → 琉球炭火やきとり 金丸
  '炭火焼鳥 ゆくる',             // → 炭火焼 仙台牛たん物語
  '糸満ガリガリー おおしろ',     // → ゆっくい茶処 おおしろ
  'Trip cafe × TIMELESS CHOCOLATE', // → HARBOR tripcafeokinawa
  'ハッピーモア市場',            // → ハッピーモア市場 tropical店(別支店の可能性)
]);

let h = fs.readFileSync(P, 'utf8');
const crlf = h.includes('\r\n');
h = h.replace(/\r\n/g, '\n');
const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function editRow(name, fn) {
  const re = new RegExp(`^  \\{n:'${esc(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}',.*$`, 'm');
  const m = h.match(re);
  if (!m) throw new Error('行が見つからない: ' + name);
  const next = fn(m[0]);
  h = h.replace(m[0], () => next);
}
const setField = (row, key, val) => {
  const lit = typeof val === 'number' ? String(val) : `'${esc(val)}'`;
  const re = new RegExp(`(,${key}:)('(?:[^'\\\\]|\\\\.)*'|[0-9.]+)`);
  if (!re.test(row)) throw new Error('field not found: ' + key);
  return row.replace(re, (_, a) => a + lit);
};
const dropField = (row, key) => row.replace(new RegExp(`,${key}:[0-9.]+`), '');

// 1. 記録の訂正
editRow('生け簀の銀次 泡瀬本舗', r => {
  r = r.replace("{n:'生け簀の銀次 泡瀬本舗',g:'izakaya'", "{n:'魚がしの銀次 泡瀬店',g:'seafood'");
  r = setField(r, 'd', '沖縄市泡瀬の海鮮食堂。旧店名「生け簀の銀次」で、昼の定食の店になった。');
  r = setField(r, 'r', '海鮮定食');
  r = setField(r, 'h', '11:30〜15:00（土・日は11:30〜17:00）（月曜定休）');
  r = r.replace('<span class="tag tag-dinner">居酒屋</span>', '<span class="tag tag-dinner">海鮮</span>');
  return r;
});
editRow('KOHAKUIMO', r => {
  r = setField(r, 'a', '那覇市/牧志');
  r = r.replace("area_id:'yomitan'", "area_id:'naha'");
  r = setField(r, 'lat', 26.217846);
  r = setField(r, 'lng', 127.687103);
  r = setField(r, 'd', '国際通り近く、牧志の熟成蜜芋スイーツ専門店。SNS映えのおしゃれな芋スイーツが大人気。');
  r = setField(r, 'h', '11:00〜20:00（火曜定休）');
  return r;
});
editRow('新潟発祥ラーメン なおじ 沖縄一号店', r => {
  r = r.replace("{n:'新潟発祥ラーメン なおじ 沖縄一号店'", "{n:'なおじ 豊見城店'");
  r = setField(r, 'a', '豊見城市/真玉橋');
  r = setField(r, 'lat', 26.194059);
  r = setField(r, 'lng', 127.694427);
  r = dropField(dropField(r, 'tb'), 'tbc');   // 移転後の店舗ページにはまだ点数が無い
  r = setField(r, 'd', '新潟発祥のラーメン店なおじ。豊見城市高安から真玉橋へ移転した。');
  r = setField(r, 'h', '11:00〜15:00・18:00〜21:00');
  return r;
});

// 2. 営業時間
const start = h.indexOf('const shops');
const shops = eval(h.slice(h.indexOf('[', start), h.indexOf('];', start) + 1));
let filled = 0, unreadable = 0;
for (const s of shops) {
  if (s.h) continue;
  const v = status[s.n + '|' + s.area_id];
  if (!v || v.status !== 'open' || !v.hours || REJECT.has(s.n)) continue;
  const c = compactHours(v.hours);
  if (!c) { unreadable++; continue; }
  editRow(s.n, r => r.replace(/,h:''/, `,h:'${esc(c)}'`));
  filled++;
}

// tabelog.json: 旧名の行は消す(apply_tabelog.js が名前の似た別店に点数を付けないように)
const tj = path.join(__dirname, 'tabelog.json');
const rows = JSON.parse(fs.readFileSync(tj, 'utf8'));
const kept = rows.filter(r => r.name !== '新潟発祥ラーメン なおじ 沖縄一号店');

console.log(`営業時間を入れた: ${filled}店 / 読み取れず: ${unreadable}店 / tabelog.json ${rows.length}→${kept.length}`);
if (!DRY) {
  fs.writeFileSync(P, crlf ? h.replace(/\n/g, '\r\n') : h);
  fs.writeFileSync(tj, JSON.stringify(kept, null, 1));
}
