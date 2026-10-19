/*
 * 既存の行に食べログの tl/tb/tbc を付け直す共通処理(深掘り 2026-10- で、表記違いで照合をすり抜けた店に使う)。冪等。
 *   require('./fix_rows')('urasoe', [{n, a, row, tl, tb, tbc, lat?, lng?, h?, key?}, ...]);
 *   n   : index.html に書かれている店名(' は \\' のまま)   key: tabelog_force.json に書く店名(' を含むときだけ)
 *   a   : 表示エリア(市町村/字)   row: 食べログ側の店名
 * index.html を直し、apply_tabelog.js が戻さないよう tabelog.json と tabelog_force.json にも書く。
 */
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function fixRows(area_id, FIX) {
  const P = path.join(__dirname, '..', 'index.html');
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
    const r = t.find(r => r.area_id === area_id && r.name === f.row);
    if (r) { r.score = f.tb; r.count = f.tbc; } else t.push({area_id, name: f.row, score: f.tb, count: f.tbc});
  }
  fs.writeFileSync(tj, JSON.stringify(t, null, 1));

  const fj = path.join(__dirname, 'tabelog_force.json');
  const force = JSON.parse(fs.readFileSync(fj, 'utf8'));
  for (const f of FIX) force[`${f.key || f.n}|${f.a}`] = f.row;
  fs.writeFileSync(fj, JSON.stringify(force, null, 2));
};
