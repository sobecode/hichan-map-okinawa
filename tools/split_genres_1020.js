/*
 * ジャンルを12→14に分ける 2026-10-20。ユーザーの提案「ステーキと焼肉、食堂も分けた方がいい」から。
 *   yakiniku(焼肉・肉料理) → yakiniku(焼肉・ホルモン) と steak(ステーキ・鉄板焼き)
 *   washoku(和食・郷土料理) → washoku と shokudo(食堂・定食)
 *   居酒屋のうち焼き鳥・もつ焼きが主の2店 → yakitori
 * 沖縄そばが中心の食堂(g:'soba')はそのまま(ユーザーの判断)。
 * 振り分けは店名・タグ・名物・説明で機械的に当てたあと、全件を目で見て下の例外を足した。
 *   node tools/split_genres_1020.js [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(P, 'utf8');
const st = src.indexOf('const shops');
const shops = eval(src.slice(src.indexOf('[', st), src.indexOf('];', st) + 1));
const tagText = s => s.tags.replace(/<[^>]+>/g, ' ');
const T = s => [s.n, s.d, s.r, tagText(s)].join(' ');

const to = {};   // 店名 → 新しい g
// ── 焼肉・肉料理: ステーキ系を steak へ ──
for (const s of shops.filter(s => s.g === 'yakiniku')) {
  const steak = /ステーキ|鉄板|ハンバーグ|steak/i.test(T(s));
  const yaki = /焼肉|焼き肉|ホルモン|ジンギスカン|yakiniku/i.test(T(s));
  if (steak && !yaki) to[s.n] = 'steak';
}
Object.assign(to, {
  'やっぱりステーキ 7th 豊見城店': 'steak',        // 焼肉とステーキの両方に当たるが、ステーキ店
  'まつもと（松山）': 'washoku',                   // あぐー豚しゃぶしゃぶ専門。ほかのしゃぶしゃぶ店に揃える
  '長堂屋': 'washoku',                              // 今帰仁アグーの豚しゃぶ
});
// ほかのジャンルに入っていたステーキハウス
for (const n of ['STEAKHOUSE NAKAMA', 'キングダム（KINGDOM）', 'フォーシーズン', "Seaside STEAK BEEFY'S", 'エメラルドオーシャンサイド',
  'サムズ アンカーイン 宜野湾店', 'オールーグリル by 星野リゾート', 'ジョージレストラン', 'マイハウス']) to[n] = 'steak';

// ── 和食: 食堂・定食を shokudo へ ──
const KEEP_WASHOKU = new Set(['山の茶屋 楽水', 'とんかつ太郎 北谷店', 'マイハウス']);
for (const s of shops.filter(s => s.g === 'washoku')) {
  if (KEEP_WASHOKU.has(s.n) || to[s.n]) continue;
  if (/食堂|定食|ドライブイン|大衆/.test(s.n + tagText(s) + s.r + s.d)) to[s.n] = 'shokudo';
}
to['よしもと食堂'] = 'soba';   // 自家製麺の創作沖縄そばの店(名前は食堂だが、そばの店)

// ── 居酒屋: 焼き鳥・もつ焼きが主の店 ──
to['炭焼家 てんぷす'] = 'yakitori';
to['末廣ブルース'] = 'yakitori';

const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
let out = src, n = 0;
const count = {};
for (const [name, g] of Object.entries(to)) {
  const s = shops.find(s => s.n === name);
  if (!s) throw new Error('店が無い: ' + name);
  if (s.g === g) continue;
  const head = `{n:'${esc(name)}',g:'${s.g}',`;
  if (out.split(head).length !== 2) throw new Error('行が一意に決まらない: ' + name);
  out = out.replace(head, `{n:'${esc(name)}',g:'${g}',`);
  const k = `${s.g}→${g}`; count[k] = (count[k] || 0) + 1; n++;
}
console.log(count, '計', n);
if (!process.argv.includes('--dry')) fs.writeFileSync(P, out);
