/*
 * 食べログの市町村別・評価順ランキングを取り、当サイトに未収録の店だけを並べる。
 *   node tools/rank_area.js <市町村コード,...> [ページ数=3] [ジャンル]
 *   例: node tools/rank_area.js 47301,47302,47303 3
 *       node tools/rank_area.js 47209 2 cafe
 *
 * 収録済みの判定は2段: ①食べログURLが tl と一致 ②name_match で 0.66 以上。
 * 点数なし(「-」)・コンビニ・チェーンの持ち帰り専門などは目で落とす前提で全部出す。
 * 結果は tools/rank_<コード>.json にも書く(候補ファイルを作るときの元データ)。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {dice} = require('./name_match');

const codes = (process.argv[2] || '').split(',').filter(Boolean);
const PAGES = Number(process.argv[3] || 3);
const GENRE = process.argv[4] ? process.argv[4] + '/' : '';
if (!codes.length) { console.error('市町村コードを指定してください'); process.exit(1); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('const shops');
const shops = eval(html.slice(html.indexOf('[', start), html.indexOf('];', start) + 1));
const known = new Set(shops.filter(s => s.tl).map(s => s.tl));

function parse(h) {
  const parts = h.split('list-rst__rst-name-target').slice(1);
  return parts.map(p => {
    const m = p.match(/href="https:\/\/tabelog\.com\/okinawa\/([^"]+)\/">([^<]*)</);
    if (!m) return null;
    const ag = (p.match(/list-rst__area-genre[^>]*>([^<]*)</) || [])[1] || '';
    const sc = (p.match(/list-rst__rating-val">([0-9.]+)/) || [])[1];
    const rv = (p.match(/list-rst__rvw-count-num[^>]*>([0-9,]+)/) || [])[1];
    return {tl: m[1], name: decode(m[2].trim()), areaGenre: decode(ag.trim()),
      tb: sc ? Number(sc) : null, tbc: rv ? Number(rv.replace(/,/g, '')) : null};
  }).filter(Boolean);
}

(async () => {
  for (const code of codes) {
    const rows = [];
    for (let p = 1; p <= PAGES; p++) {
      const url = `https://tabelog.com/okinawa/C${code}/rstLst/${GENRE}${p > 1 ? p + '/' : ''}?Srt=D&SrtT=rt`;
      const r = await fetch(url, {headers: {'User-Agent': UA, 'Accept-Language': 'ja'}});
      if (r.status !== 200) { console.log(`  ${url} → ${r.status}`); break; }
      const got = parse(await r.text());
      if (!got.length) break;
      rows.push(...got);
      await sleep(1300);
    }
    const seen = new Set();
    const out = [];
    for (const x of rows) {
      if (seen.has(x.tl)) continue;   // 広告枠と通常枠の重複
      seen.add(x.tl);
      let match = null;
      if (known.has(x.tl)) match = {n: shops.find(s => s.tl === x.tl).n, sim: 'URL'};
      else {
        for (const s of shops) {
          const v = dice(s.n, x.name);
          if (v >= 0.66 && (!match || v > match.sim)) match = {n: s.n, sim: v};
        }
      }
      out.push({...x, match});
    }
    fs.writeFileSync(path.join(__dirname, `rank_${code}${GENRE ? '_' + GENRE.slice(0, -1) : ''}.json`), JSON.stringify(out, null, 1));
    console.log(`\n=== ${code} ${GENRE} (${out.length}件) ===`);
    out.forEach((x, i) => console.log(
      `${String(i + 1).padStart(2)} ${x.tb == null ? ' -  ' : x.tb.toFixed(2)} (${x.tbc ?? 0}) ${x.match ? '収録 ' : '★新 '}${x.name} ｜ ${x.areaGenre}` +
      (x.match && x.match.sim !== 'URL' ? `  ≒ ${x.match.n} (${x.match.sim.toFixed(2)})` : '')));
  }
})();
