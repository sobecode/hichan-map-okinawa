/*
 * 北から順の深掘り(2026-10-)で使う共通の追加処理。各エリアの add_*.js から呼ぶ。
 *
 *   require('./add_rows')({
 *     area_id: 'nago', muni: '名護市', detail: 'detail_rank_47209.json',
 *     rows: [[店名, g, 字ラベル, 説明, 名物, 営業時間の上書き|null, [[tag,ラベル]...], {gsi:'字'}?], ...]
 *   });
 *
 * - 座標・点数・食べログURLは detail(tools/tabelog_detail.js の出力)から取る
 * - 閉店などの店、GSI逆ジオコーダの字が字ラベルと合わない店は例外で止める。
 *   ホテルが字境にまたがるなど意図的に違う場合は 8番目に {gsi:'GSIが返す字'} を書く
 * - そのエリアの最後の行の直後に入れる。店名がすでにあれば止める
 * - tabelog.json にも行を足す(apply_tabelog.js が tb を付け直すときに消えないように)
 * - --dry で書き込まない
 */
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function addRows({area_id, muni, detail, rows}) {
  const DRY = process.argv.includes('--dry');
  const P = path.join(__dirname, '..', 'index.html');
  const det = require(path.join(__dirname, detail));
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const bare = s => String(s || '').replace(/字/g, '').replace(/[一二三四五六七八九十]+丁目$/, '');

  const lines = rows.map(([n, g, aza, d, r, hOver, tags, opt = {}]) => {
    const x = det.find(v => v.name === n);
    if (!x) throw new Error('detail に無い: ' + n);
    if (x.status !== 'open') throw new Error(`営業中でない: ${n} ${x.status}`);
    const want = bare(opt.gsi || aza);
    if (bare(x.gsi) !== want) throw new Error(`字が合わない: ${n} ${want} / GSI ${x.gsi}`);
    const h = hOver != null ? hOver : (x.h || '');
    const tg = tags.map(([c, l]) => `<span class="tag tag-${c}">${l}</span>`).join('');
    return `  {n:'${esc(n)}',g:'${g}',a:'${muni}/${aza}',area_id:'${area_id}',lat:${x.lat},lng:${x.lng},tb:${x.tb},tbc:${x.tbc},tl:'${x.tl}',d:'${esc(d)}',r:'${esc(r)}',h:'${esc(h)}',tags:'${tg}',badges:''},`;
  });

  const src = fs.readFileSync(P, 'utf8');
  const nl = src.includes('\r\n') ? '\r\n' : '\n';
  const arr = src.split(/\r?\n/);
  const dup = rows.filter(([n]) => arr.some(l => l.startsWith(`  {n:'${esc(n)}',`)));
  if (dup.length) throw new Error('すでに入っている: ' + dup.map(r => r[0]).join(', '));
  let last = -1;
  arr.forEach((l, i) => { if (l.includes(`area_id:'${area_id}'`)) last = i; });
  if (last < 0) throw new Error('エリアの行が見つからない: ' + area_id);
  arr.splice(last + 1, 0, ...lines);
  console.log(`${area_id}: ${lines.length}店を ${last + 2} 行目に追加${DRY ? '(dry)' : ''}`);
  if (DRY) return;
  fs.writeFileSync(P, arr.join(nl));

  const tj = path.join(__dirname, 'tabelog.json');
  const t = JSON.parse(fs.readFileSync(tj, 'utf8'));
  let added = 0;
  for (const [n] of rows) {
    const x = det.find(v => v.name === n);
    if (x.tb == null || t.some(r => r.area_id === area_id && r.name === n)) continue;
    t.push({area_id, name: n, score: x.tb, count: x.tbc}); added++;
  }
  fs.writeFileSync(tj, JSON.stringify(t, null, 1));
  console.log(`tabelog.json に ${added} 行`);
};
