/*
 * fetch_ratings.js が書き出した tools/ratings.json を index.html に反映する。
 *
 *   node tools/apply_ratings.js --dry     # 変更内容を表示するだけ
 *   node tools/apply_ratings.js           # 実際に書き込む
 *
 * verdict が 'OK' の行だけを採用する。'要確認' は名前が一致していない可能性があるので、
 * 目で見て判断してから ratings.json の verdict を 'OK' に直して再実行する。
 * 閉業(CLOSED_PERMANENTLY)の店は反映せず、一覧で報告する。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');
const DRY = process.argv.includes('--dry');
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'ratings.json'), 'utf8'));

const byName = new Map();
rows.forEach(r => byName.set(r.n + '|' + r.a, r));

const lines = fs.readFileSync(INDEX, 'utf8').split('\n');
let applied = 0, skipped = 0, closed = [];

for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (!/^\s*\{n:'/.test(L)) continue;
  const n = (/\{n:'((?:[^'\\]|\\.)*)'/.exec(L) || [])[1];
  const a = (/,a:'((?:[^'\\]|\\.)*)'/.exec(L) || [])[1];
  if (n == null || a == null) continue;
  const r = byName.get(n.replace(/\\'/g, "'") + '|' + a.replace(/\\'/g, "'"));
  if (!r) continue;

  if (r.bizStatus === 'CLOSED_PERMANENTLY') { closed.push(`${n} 〔${a}〕`); skipped++; continue; }
  if (r.verdict !== 'OK' || r.rating == null) { skipped++; continue; }

  const rt = Number(r.rating).toFixed(1);
  const rc = r.count != null ? `rc:${r.count},` : '';
  let out = L.replace(/,rt:[\d.]+,/, ',').replace(/,rc:\d+,/, ','); // 既存値は差し替える
  const before = out;
  out = out.replace(/(lng:-?[\d.]+,)/, `$1rt:${rt},${rc}`);
  if (out === before) { console.log('★lng が見つからない行:', n); process.exit(1); }
  if (out !== L) applied++;
  lines[i] = out;
}

if (!DRY) fs.writeFileSync(INDEX, lines.join('\n'), 'utf8');
console.log(`${DRY ? '[dry run] ' : ''}反映 ${applied} 件 / 見送り ${skipped} 件`);
if (closed.length) {
  console.log(`\n閉業(CLOSED_PERMANENTLY)として返ってきた ${closed.length} 件 — 削除を検討:`);
  closed.forEach(c => console.log('  ' + c));
}
