/*
 * 閉店・移転の疑いがある店を絞り込む。
 *   node tools/audit_closed.js
 *
 * 今日取得した2つのソースのどちらかに現れた店は、営業している見込みが高い:
 *   - tb(食べログ点数)を持つ = 評価順ランキングに載っていた(閉店・掲載保留は落ちる)
 *   - OSM に名前付きPOIがある
 * どちらにも現れない店が要調査プール。そのうえで危険度で並べる。
 *
 * 危険度の材料:
 *   - 住所が特定できず手置き座標のまま(小数3桁以下)     … 実在が怪しい
 *   - h(営業時間)も r(おすすめ)も薄い                  … 情報源が乏しかった
 *   - NEW/HOTバッジ付き                                … 追加時点の鮮度に依存した記述
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {dice, metres, BAR} = require('./name_match');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const shops = eval(html.match(/const shops\s*=\s*(\[[\s\S]*?\]);/)[1]);
const pois = JSON.parse(fs.readFileSync(path.join(__dirname, 'osm_pois.json'), 'utf8'));

const decimals = v => { const d = String(v).split('.')[1]; return d ? d.length : 0; };
const prec = s => Math.min(decimals(s.lat), decimals(s.lng));

// OSM に一致するPOIがあるか(距離は問わない。存在確認が目的)
const inOsm = new Set();
shops.forEach(s => {
  const near = pois.filter(p => Math.abs(p.lat - s.lat) < 0.06 && Math.abs(p.lon - s.lng) < 0.06);
  if (near.some(p => dice(s.n, p.name) >= BAR && metres(s.lat, s.lng, p.lat, p.lon) <= 5000)) inOsm.add(s.n);
});

const rows = shops.map(s => {
  const tabelog = !!s.tb;
  const osm = inOsm.has(s.n);
  let risk = 0;
  const why = [];
  if (!tabelog && !osm) { risk += 3; why.push('食べログ・OSM両方に無い'); }
  else if (!tabelog) { risk += 1; why.push('食べログ未掲載'); }
  if (prec(s) <= 3) { risk += 3; why.push(`座標が手置き(${prec(s)}桁)`); }
  if (!s.h) { risk += 1; why.push('営業時間なし'); }
  if (/new-badge/.test(s.badges)) { risk += 1; why.push('NEWバッジ'); }
  if (s.d.length < 20) { risk += 1; why.push('説明が短い'); }
  return {s, tabelog, osm, risk, why};
});

const confirmed = rows.filter(r => r.tabelog || r.osm);
const pool = rows.filter(r => !r.tabelog && !r.osm).sort((a, b) => b.risk - a.risk);

console.log(`全 ${shops.length} 店`);
console.log(`  今日のソースで存在を確認できた: ${confirmed.length} 店`);
console.log(`      食べログ点数あり ${rows.filter(r => r.tabelog).length} / OSMにPOIあり ${rows.filter(r => r.osm).length}`);
console.log(`  どちらにも無く要調査: ${pool.length} 店\n`);

const buckets = {};
pool.forEach(r => { const k = Math.min(r.risk, 8); (buckets[k] || (buckets[k] = [])).push(r); });
Object.keys(buckets).map(Number).sort((a, b) => b - a).forEach(k => {
  console.log(`--- 危険度 ${k} : ${buckets[k].length} 店 ---`);
  buckets[k].forEach(r => console.log(`  ${r.s.n} 〔${r.s.a}/${r.s.g}〕 ${r.why.join(' / ')}`));
});
