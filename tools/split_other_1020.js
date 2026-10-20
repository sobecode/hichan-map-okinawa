/*
 * 洋食・多国籍(other)を分ける 2026-10-20。ユーザーの提案「タコスとタコライスは一緒、あとは分けた方がいい」から。
 *   tacos(タコス・タコライス) burger(ハンバーガー) italian(イタリアン・ピザ) french(フレンチ・ビストロ)
 *   asian(アジア・エスニック) bar(バー・ビール)、残りは other(洋食・多国籍)
 * 店名・タグ・名物・説明で機械的に当てたあと、222店を全件目で見て下の例外を足した。
 * 洋食ではない店(持ち帰りのいなり・天ぷら、サービスエリアやゴルフ場の食堂)もついでに正しいジャンルへ移す。
 *   node tools/split_other_1020.js [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(P, 'utf8');
const st = src.indexOf('const shops');
const shops = eval(src.slice(src.indexOf('[', st), src.indexOf('];', st) + 1));
const T = s => [s.n, s.d, s.r, s.tags.replace(/<[^>]+>/g, ' ')].join(' ');

const RULES = [
  ['tacos', /タコス|タコライス|taco/i],
  ['burger', /バーガー|burger/i],
  ['italian', /イタリアン|パスタ|ピザ|ピッツァ|トラットリア|オステリア|リストランテ|pizza|italian/i],
  ['french', /フレンチ|フランス料理|ビストロ|french|bistro/i],
  ['asian', /タイ料理|ベトナム|韓国|台湾|アジア|エスニック|インド|ネパール|スパイス|カレー|トルコ|curry/i],
  ['bar', /ビアバー|ワインバー|カクテル|ビール|ブルワリー|バー(?!ガ)|bar\b|pub/i],
];
const FIX = {
  // 洋食・多国籍のまま
  'PAUL': 'other', 'ジャンバルターコー': 'other', 'DOUBLE DECKER': 'other', '沖縄Diner Hi31BASE（ハイサイベース）': 'other',
  'うるまキッチン ネリネ': 'other', 'ばくばく亭': 'other', 'ブエノチキン 普天間店': 'other', 'YOSHOKUDOミナトヤ 浦添店': 'other',
  'QWACHI(オリエンタルホテル沖縄)': 'other',
  // タコスに当たったがバーガーの店
  'WHITEdog BURGER': 'burger', 'ポッケファーム': 'burger', 'アメリカ食堂　サンズ・ダイナー': 'burger',
  'キリンビア＆スナック': 'bar',
  '大城鶏飯（おおぎけいはん）': 'asian',
  // 洋食ではない店
  '丸一食品 塩屋店': 'washoku', '丸一食品 本店': 'washoku', '丸吉食品': 'washoku', 'やんばる物産センター 天ぷら店': 'washoku',
  '伊芸サービスエリア（下り）レストラン': 'shokudo', '宜野座カントリークラブ': 'shokudo', 'わぁ～家～': 'shokudo',
};

const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
let out = src;
const count = {};
for (const s of shops.filter(s => s.g === 'other')) {
  const g = FIX[s.n] || (RULES.find(([, r]) => r.test(T(s))) || ['other'])[0];
  if (g === 'other') continue;
  const head = `{n:'${esc(s.n)}',g:'other',`;
  if (out.split(head).length !== 2) throw new Error('行が一意に決まらない: ' + s.n);
  out = out.replace(head, `{n:'${esc(s.n)}',g:'${g}',`);
  count[g] = (count[g] || 0) + 1;
}
for (const n of Object.keys(FIX)) if (!shops.some(s => s.n === n && s.g === 'other')) throw new Error('例外の店が other に無い: ' + n);
console.log(count);
if (!process.argv.includes('--dry')) fs.writeFileSync(P, out);
