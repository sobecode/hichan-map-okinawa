/*
 * 食べログの店舗ページへのリンクを shops 配列の tl に入れる。
 *   node tools/add_tabelog_links.js [--dry]
 *
 * 出どころは 2026-09-25 の全店点検(tools/tabelog_status.json)。営業中と確認できた店だけ。
 * 一致0.75で別の店に当たっていた組(apply_status_0925.js の REJECT)は付けない。
 * URL は https://tabelog.com/okinawa/ より後ろだけを持つ(1000店ぶんで約30KB節約)。
 * 何度流しても同じ結果になるよう、既存の tl はいったん全部落としてから付け直す。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');
const P = path.join(__dirname, '..', 'index.html');
const status = require('./tabelog_status.json');

const REJECT = new Set([
  '中国料理 金紗沙', 'THE TERRACE BAKERY', 'Little Thailand Okinawa', "Seaside STEAK BEEFY'S",
  '串カツ あしだ屋', 'やきとり イツトヨツ', '炭火焼鳥 ゆくる', '糸満ガリガリー おおしろ',
  'Trip cafe × TIMELESS CHOCOLATE', 'ハッピーモア市場',
]);
const PREFIX = 'https://tabelog.com/okinawa/';

const raw = fs.readFileSync(P, 'utf8');
const nl = raw.includes('\r\n') ? '\r\n' : '\n';
let added = 0, dropped = 0;
const out = raw.split(/\r?\n/).map(line => {
  if (!line.startsWith('  {n:')) return line;
  const had = /,tl:'[^']*'/.test(line);
  line = line.replace(/,tl:'[^']*'/, '');
  const s = eval('(' + line.trim().replace(/,$/, '') + ')');
  const v = status[s.n + '|' + s.area_id];
  if (!v || v.status !== 'open' || !v.url || REJECT.has(s.n) || !v.url.startsWith(PREFIX)) {
    if (had) dropped++;
    return line;
  }
  const tl = v.url.slice(PREFIX.length).replace(/\/$/, '');
  if (!/^[A-Za-z0-9/]+$/.test(tl)) throw new Error('想定外のURL: ' + v.url);
  added++;
  return line.replace(/,d:'/, `,tl:'${tl}',d:'`);
}).join(nl);

console.log(`tl を付けた店: ${added}  (以前あって今回外れた: ${dropped})`);
if (!DRY) fs.writeFileSync(P, out);
