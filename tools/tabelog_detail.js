/*
 * 食べログの店舗ページから、追加に要る情報をまとめて取る。
 *   node tools/tabelog_detail.js <rank_*.json> <店名1>,<店名2>,...  > out
 *   (rank_*.json は tools/rank_area.js の出力)
 *
 * 取るもの: 住所、ジャンル、営業時間(compactHours で h の書式に)、電話、
 *           地図の中心座標(店舗ページの静的地図 center=lat,lng)、閉店などの状態。
 * 座標は店側・食べログ側が置いたピンなので、GSI逆ジオコーダで字を突き合わせて確かめる。
 * 結果は tools/detail_<rankファイル名>.json に書く。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {compactHours} = require('./compact_hours');

const rankFile = process.argv[2];
const names = (process.argv[3] || '').split(',').map(s => s.trim()).filter(Boolean);
const rank = require(path.resolve(__dirname, rankFile));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => s.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

function cell(h, label) {
  const i = h.indexOf(`<th>${label}</th>`) > -1 ? h.indexOf(`<th>${label}</th>`) : h.indexOf(`${label}</th>`);
  if (i < 0) return '';
  const j = h.indexOf('<td', i), k = h.indexOf('</td>', j);
  return text(h.slice(h.indexOf('>', j) + 1, k));
}

(async () => {
  const out = [];
  for (const n of names) {
    // 食べログ側の名前に全角空白・nbspや、濁点を分けた文字(NFD)が混ざる
    const sp = s => s.normalize('NFC').replace(/\s+/g, ' ');
    const x = rank.find(r => sp(r.name) === sp(n));
    if (!x) { console.error('ランキングに無い: ' + n); continue; }
    const r = await fetch(`https://tabelog.com/okinawa/${x.tl}/`, {headers: {'User-Agent': UA, 'Accept-Language': 'ja'}});
    const h = await r.text();
    const title = (h.match(/<title>([^<]*)/) || [])[1] || '';
    const c = h.match(/center=([0-9.]+),([0-9.]+)/);
    const rec = {
      name: n, tl: x.tl, tb: x.tb, tbc: x.tbc,
      status: (title.match(/^【([^】]+)】/) || [])[1] || 'open',
      addr: cell(h, '住所').replace(/大きな地図を見る.*$/, '').replace(/\s/g, ''),
      genre: cell(h, 'ジャンル'),
      tel: cell(h, '電話番号') || cell(h, '予約・<br>お問い合わせ'),
      hoursRaw: cell(h, '営業時間'),
      lat: c ? Number(Number(c[1]).toFixed(6)) : null,
      lng: c ? Number(Number(c[2]).toFixed(6)) : null,
    };
    rec.h = compactHours(rec.hoursRaw);
    // GSI逆ジオコーダ: 座標が落ちる市町村・字
    if (rec.lat) {
      const g = await (await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${rec.lat}&lon=${rec.lng}`)).json();
      rec.gsi = g.results ? g.results.lv01Nm : '(陸地外)';
    }
    out.push(rec);
    console.log(`${rec.status === 'open' ? '' : '【' + rec.status + '】'}${n} | ${rec.addr} | GSI字:${rec.gsi} | ${rec.lat},${rec.lng} | ${rec.genre} | ${rec.h || '(時間読めず) ' + rec.hoursRaw.slice(0, 60)}`);
    await sleep(1300);
  }
  fs.writeFileSync(path.join(__dirname, 'detail_' + path.basename(rankFile)), JSON.stringify(out, null, 1));
})();
