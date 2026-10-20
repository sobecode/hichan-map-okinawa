/*
 * しゃぶしゃぶ・鍋(shabu)を独立させる 2026-10-20。ユーザーの依頼「和食かしゃぶしゃぶも分けて欲しい」から。
 * しゃぶしゃぶ・すき焼き・鍋が主の店だけを移す。居酒屋や和食店でメニューの1つとしてある店は元のまま。
 * 候補(店名・タグ・名物に しゃぶ/すき焼/鍋)を全件目で見て決めた。
 *   node tools/split_shabu_1020.js [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(P, 'utf8');
const st = src.indexOf('const shops');
const shops = eval(src.slice(src.indexOf('[', st), src.indexOf('];', st) + 1));

const MOVE = [
  // 和食から
  'アグー豚料理店おBAR 喜瀬店', 'やんばるダイニング 松の古民家', 'あぐーしゃぶしゃぶ・沖縄料理 かふぅ', '島豚・琉球牛 燦 別邸',
  'オーシャンBoo！恩納村店', 'ぶたや黒将', 'オーシャンBoo！読谷村本店', 'アグーしゃぶしゃぶ 神まえ', '北谷ダイニング ちゃぁぶー',
  'まつもと（松山）', 'しゃぶしゃぶ金武 本店', '琉の国 本店', '長堂屋', 'グスク', 'あぐーの店 山城亭', 'アグーしゃぶしゃぶ みるく 恩納村万座店',
  'かふぅ 瀬良垣店', '和琉', '沖縄料理としゃぶしゃぶのお店 赤瓦', '朝陽屋', 'しゃぶしゃぶ光久本家', 'アグーしゃぶしゃぶ みるく 那覇店',
  '和牛すき焼き鍋くもまつ', 'たくよし', 'あぐー豚しゃぶしゃぶ専門店 オーシャンBoo! 那覇店', '金武アグーと山城牛のしゃぶしゃぶ琉球 国際通り店',
  '寄居', 'アグー豚しゃぶしゃぶ なかやま', '今帰仁アグーしゃぶしゃぶ長堂屋 那覇店', '島しゃぶしゃぶNAKAMA', '金武アグーと山城牛のしゃぶしゃぶ 琉球 別邸',
  // 居酒屋から(しゃぶしゃぶ・鍋の専門店)
  '島しゃぶ屋 豚とん拍子', 'アダン 沖縄店', '沖縄民謡しゃぶしゃぶ かりうた', 'ちゃぁぶ〜読谷店', 'しゃぶしゃぶ温野菜 北谷店',
  'しゃぶしゃぶ温野菜 豊崎店', 'ripalo', '我那覇豚肉店 カフーナ旭橋店', 'AKINDO',
];

const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
let out = src;
const count = {};
for (const n of MOVE) {
  const s = shops.find(s => s.n === n);
  if (!s) throw new Error('店が無い: ' + n);
  const head = `{n:'${esc(n)}',g:'${s.g}',`;
  if (out.split(head).length !== 2) throw new Error('行が一意に決まらない: ' + n);
  out = out.replace(head, `{n:'${esc(n)}',g:'shabu',`);
  count[s.g] = (count[s.g] || 0) + 1;
}
console.log(count, '計', MOVE.length);
if (!process.argv.includes('--dry')) fs.writeFileSync(P, out);
