/*
 * 北谷の深掘り(2026-10-19)で見つかった既存6店の食べログ対応の欠け・誤りを直す。冪等。
 *   node tools/fix_chatan_1019.js
 * 英字表記の店は name_match がカタカナ表記の食べログと結びつけられず、点数もURLも無かった。
 * - ZHYVAGO の2店はピンが入れ違い気味だった(WORKS が Roastery の位置にあった) → 店舗ページの座標へ
 * - ブルーシール 北谷店（デポアイランド店）は説明・位置はデポアイランド店なのに、tl/点数は
 *   国道沿いの「ブルーシール 北谷店」(美浜1-5-8)のものだった。北谷店は別の行として足す(add_chatan2.js)
 * - シーサイド ステーキ ビーフィーズ は tabelog_exclude.json で「Hanon とは別店」として外していた。
 *   当サイトにも Seaside STEAK BEEFY'S があるので、外すのをやめて名指しで結ぶ
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'index.html');

const FIX = [
  {n: 'ZHYVAGO COFFEE WORKS', a: '北谷町/美浜', row: 'ジバゴ コーヒー ワークス オキナワ', tl: 'A4703/A470304/47016552', tb: 3.52, tbc: 418, lat: 26.315833, lng: 127.753746},
  {n: 'Zhyvago Coffee Roastery', a: '北谷町/美浜', row: 'ジバゴ コーヒー ローステリー', tl: 'A4703/A470304/47026798', tb: 3.54, tbc: 390, lat: 26.31826, lng: 127.755707, h: '7:00〜22:00'},
  {n: 'ブルーシール 北谷店（デポアイランド店）', a: '北谷町/美浜', row: 'ブルーシール デポアイランド店', tl: 'A4703/A470304/47007343', tb: 3.53, tbc: 315, h: '11:00〜21:00'},
  {n: "Chatan Burger Base Atabii\\'s", a: '北谷町/美浜', key: "Chatan Burger Base Atabii's", row: 'チャタン バーガー ベース アタビーズ', tl: 'A4703/A470304/47019850', tb: 3.48, tbc: 296},
  {n: "Seaside STEAK BEEFY\\'S", a: '北谷町/美浜', key: "Seaside STEAK BEEFY'S", row: 'シーサイド ステーキ ビーフィーズ', tl: 'A4703/A470304/47021880', tb: 3.34, tbc: 108},
  {n: 'WaGyu-Cafe KAPUKA', a: '北谷町/美浜', row: '和牛カフェ カプカ', tl: 'A4703/A470304/47018967', tb: 3.36, tbc: 132},
];

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let src = fs.readFileSync(P, 'utf8');
for (const f of FIX) {
  const m = src.match(new RegExp(`^(  \\{n:'${reEsc(f.n)}',[^\\n]*)$`, 'm'));
  if (!m) throw new Error('行が無い: ' + f.n);
  let line = m[1].replace(/,tb:[0-9.]+,tbc:\d+/, '').replace(/,tl:'[^']*'/, '');
  if (f.lat) line = line.replace(/,lat:[0-9.]+,lng:[0-9.]+/, `,lat:${f.lat},lng:${f.lng}`);
  if (f.h) line = line.replace(/,h:'[^']*'/, `,h:'${f.h}'`);
  line = line.replace(/(,lng:[0-9.]+)/, `$1,tb:${f.tb},tbc:${f.tbc},tl:'${f.tl}'`);
  src = src.replace(m[1], line);
  console.log(f.key || f.n, '→', f.tl, f.tb);
}
fs.writeFileSync(P, src);

const tj = path.join(__dirname, 'tabelog.json');
const t = JSON.parse(fs.readFileSync(tj, 'utf8'));
for (const f of FIX) {
  const r = t.find(r => r.area_id === 'chatan' && r.name === f.row);
  if (r) { r.score = f.tb; r.count = f.tbc; } else t.push({area_id: 'chatan', name: f.row, score: f.tb, count: f.tbc});
}
fs.writeFileSync(tj, JSON.stringify(t, null, 1));

const fj = path.join(__dirname, 'tabelog_force.json');
const force = JSON.parse(fs.readFileSync(fj, 'utf8'));
for (const f of FIX) force[`${f.key || f.n}|${f.a}`] = f.row;
fs.writeFileSync(fj, JSON.stringify(force, null, 2));

const ej = path.join(__dirname, 'tabelog_exclude.json');
const ex = JSON.parse(fs.readFileSync(ej, 'utf8'));
if (ex['シーサイド ステーキ ビーフィーズ']) { delete ex['シーサイド ステーキ ビーフィーズ']; fs.writeFileSync(ej, JSON.stringify(ex, null, 1)); }
