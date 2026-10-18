/*
 * 恩納村の深掘り(2026-10-19)で見つかった既存3店の食べログ対応の誤り・欠けを直す。冪等。
 *   node tools/fix_onna_1019.js
 * - 海鮮料理 浜の家(仲泊2097の食堂)に、なかゆくい市場の直売店(3.39)の点数が付いていた → 本物の 浜の家(3.25)へ
 * - House Without A Key は食べログでは「ハウス ウィズアウト ア キー」。表記違いで点数もURLも無かった
 * - オーシャンBoo！恩納村店(前兼久) の tl が別支店の恩納万座店を指していた
 * index.html の tl/tb/tbc を直し、apply_tabelog.js が戻さないよう tabelog.json と tabelog_force.json にも書く。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'index.html');

const FIX = [
  {n: '海鮮料理 浜の家', a: '恩納村/仲泊', row: '浜の家', tl: 'A4703/A470303/47000212', tb: 3.25, tbc: 94},
  {n: 'House Without A Key', a: '恩納村/名嘉真', row: 'ハウス ウィズアウト ア キー', tl: 'A4703/A470303/47024414', tb: 3.55, tbc: 405},
  {n: 'オーシャンBoo！恩納村店', a: '恩納村/前兼久', row: 'あぐー豚しゃぶしゃぶ専門店オーシャンBoo！ 恩納村店', tl: 'A4703/A470303/47026142', tb: 3.57, tbc: 324},
];

let src = fs.readFileSync(P, 'utf8');
for (const f of FIX) {
  const re = new RegExp(`^(  \\{n:'${f.n}',[^\\n]*)$`, 'm');
  const m = src.match(re);
  if (!m) throw new Error('行が無い: ' + f.n);
  let line = m[1].replace(/,tb:[0-9.]+,tbc:\d+/, '').replace(/,tl:'[^']*'/, '');
  line = line.replace(/(,lng:[0-9.]+)/, `$1,tb:${f.tb},tbc:${f.tbc},tl:'${f.tl}'`);
  src = src.replace(m[1], line);
  console.log(f.n, '→', f.tl, f.tb);
}
fs.writeFileSync(P, src);

const tj = path.join(__dirname, 'tabelog.json');
const t = JSON.parse(fs.readFileSync(tj, 'utf8'));
for (const f of FIX) {
  const r = t.find(r => r.area_id === 'onna' && r.name === f.row);
  if (r) { r.score = f.tb; r.count = f.tbc; } else t.push({area_id: 'onna', name: f.row, score: f.tb, count: f.tbc});
}
fs.writeFileSync(tj, JSON.stringify(t, null, 1));

const fj = path.join(__dirname, 'tabelog_force.json');
const force = JSON.parse(fs.readFileSync(fj, 'utf8'));
for (const f of FIX) force[`${f.n}|${f.a}`] = f.row;
fs.writeFileSync(fj, JSON.stringify(force, null, 2));
