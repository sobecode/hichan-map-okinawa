/*
 * 全店を食べログで引き直し、営業状態と営業時間を集める。
 *   node tools/tabelog_status.js            (途中から再開できる)
 *   node tools/tabelog_status.js --report   (集計だけ)
 *
 * 1. 店名で検索 (https://tabelog.com/okinawa/rstLst/?sw=店名)
 *    一覧の「市町村 / ジャンル」欄が当サイトの市町村と一致する候補だけを name_match で照合
 * 2. 当たった店舗ページの <title> 先頭で状態を読む:【閉店】【休業】【移転】【掲載保留】
 *    ついでに営業時間表を「曜日 時刻」の短い文字列にして持ち帰る(昼夜バッジを推測から実データへ)
 * 結果は tools/tabelog_status.json (店名|area_id → {url, status, hours, sim})。
 * 検索に出ない店は status:"notfound"。閉店店は検索から消えるので、ここが要調査プールになる。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {bestMatch} = require('./name_match');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'tabelog_status.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const WAIT = 1300;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const start = html.indexOf('const shops');
const shops = eval(html.slice(html.indexOf('[', start), html.indexOf('];', start) + 1));

const db = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const save = () => fs.writeFileSync(OUT, JSON.stringify(db, null, 1));

const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function get(url) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, {headers: {'User-Agent': UA, 'Accept-Language': 'ja'}});
      if (r.status === 200) return await r.text();
      if (r.status === 404) return '';
      await sleep(5000 * (t + 1));
    } catch (e) { await sleep(5000 * (t + 1)); }
  }
  throw new Error('fetch failed: ' + url);
}

function parseList(h) {
  const out = [];
  const re = /list-rst__rst-name-target[^>]*href="(https:\/\/tabelog\.com\/okinawa\/[^"]+\/)">([^<]*)<\/a>[\s\S]*?list-rst__area-genre[^>]*>([^<]*)</g;
  let m;
  while ((m = re.exec(h))) out.push({url: m[1], name: decode(m[2].trim()), area: m[3].trim()});
  return out;
}

function parsePage(h) {
  const t = (h.match(/<title>([^<]*)/) || [])[1] || '';
  const st = (t.match(/^【(閉店|休業|移転|掲載保留|一時休業|休業中)】/) || [])[1] || 'open';
  let hours = '';
  const i = h.indexOf('営業時間</th>');
  if (i > -1) {
    const j = h.indexOf('</td>', i);
    hours = h.slice(i + 10, j).replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  }
  return {status: st, title: decode(t), hours: decode(hours)};
}

function report() {
  const rows = shops.map(s => ({s, r: db[s.n + '|' + s.area_id]})).filter(x => x.r);
  const by = {};
  rows.forEach(({r}) => { by[r.status] = (by[r.status] || 0) + 1; });
  console.log(`点検済み ${rows.length}/${shops.length}`, by);
  for (const st of ['閉店', '移転', '休業', '一時休業', '休業中', '掲載保留']) {
    rows.filter(x => x.r.status === st).forEach(({s, r}) => console.log(`【${st}】${s.n}〔${s.a}〕 ${r.url} ← ${r.tbName} (${r.sim})`));
  }
}

(async () => {
  if (process.argv.includes('--report')) return report();
  let n = 0;
  for (const s of shops) {
    const key = s.n + '|' + s.area_id;
    if (db[key]) continue;
    const muni = (s.a.split('/')[0] || '').trim();
    // 支店名・施設名まで入れると0件になることがあるので、当たるまで短くして引き直す
    const full = s.n.replace(/[【】「」（）()]/g, ' ').replace(/s+/g, ' ').trim();
    const words = full.split(' ');
    const queries = [...new Set([full, words.length > 1 ? words.slice(0, -1).join(' ') : '', words[0].length >= 2 ? words[0] : ''].filter(Boolean))];
    let list = [], cands = [];
    for (const q of queries) {
      list = parseList(await get('https://tabelog.com/okinawa/rstLst/?sw=' + encodeURIComponent(q)));
      await sleep(WAIT);
      // 広告枠と通常枠で同じ店が2回出るので、URLで1件にまとめる(同点扱いで取りこぼさないため)
      const seen = new Set();
      cands = list.filter(c => (!muni || c.area.includes(muni)) && !seen.has(c.url) && seen.add(c.url));
      if (bestMatch(s.n, cands, c => c.name).match) break;
    }
    const {match, sim, ambiguous} = bestMatch(s.n, cands, c => c.name);
    if (!match) {
      db[key] = {status: ambiguous ? 'ambiguous' : 'notfound', sim: +sim.toFixed(2), hits: list.slice(0, 3).map(c => c.name + '@' + c.area)};
    } else {
      const p = parsePage(await get(match.url));
      await sleep(WAIT);
      db[key] = {status: p.status, url: match.url, tbName: match.name, sim: +sim.toFixed(2), hours: p.hours};
    }
    save();
    if (++n % 10 === 0) console.log(n, key, db[key].status);
  }
  save();
  report();
})().catch(e => { save(); console.error(e); process.exit(1); });
