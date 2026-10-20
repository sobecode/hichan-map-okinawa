/*
 * パーラー・軽食(parlor)を独立させる 2026-10-20。ユーザーの提案「パーラーも分けた方がいい」から。
 * 沖縄の軽食スタンドのパーラーに、同じ使われ方をする沖縄天ぷら屋と、いなり・からあげの持ち帰り店を合わせた(ユーザーの選択)。
 * 名前だけ「パーラー」の店(ダイニングバーのアスナロ、居酒屋の小やじ、タイ料理のカオソーイ、
 * ブルーシールパーラー、PARLOR K's Pit、カフェのフィーフィーパーラー)は元のまま。
 *   node tools/split_parlor_1020.js [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(P, 'utf8');
const st = src.indexOf('const shops');
const shops = eval(src.slice(src.indexOf('[', st), src.indexOf('];', st) + 1));

const MOVE = [
  // パーラー
  'パーラー カズ', '港町パーラー', '辺戸岬こうようパーラー', 'パーラー嘉例', 'パーラーゆめちゃん', 'パーラーくがに', 'フルーツパーラー',
  // 沖縄天ぷら
  'かどや', '中本鮮魚店', '大城てんぷら店', 'やんばる物産センター 天ぷら店', '恩納村水産物直売店 浜の家',
  // いなり・からあげの持ち帰り
  '丸一食品 塩屋店', '丸一食品 本店', '丸吉食品', 'オイナリアン ぎのわん本店', 'たけ田商店 中城店',
];

const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
let out = src;
const count = {};
for (const n of MOVE) {
  const s = shops.find(s => s.n === n);
  if (!s) throw new Error('店が無い: ' + n);
  const head = `{n:'${esc(n)}',g:'${s.g}',`;
  if (out.split(head).length !== 2) throw new Error('行が一意に決まらない: ' + n);
  out = out.replace(head, `{n:'${esc(n)}',g:'parlor',`);
  count[s.g] = (count[s.g] || 0) + 1;
}
console.log(count, '計', MOVE.length);
if (!process.argv.includes('--dry')) fs.writeFileSync(P, out);
