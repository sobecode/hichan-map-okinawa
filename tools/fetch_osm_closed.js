/*
 * OSM で「閉業」として記録されている店を沖縄本島分まとめて取得する。
 *   node tools/fetch_osm_closed.js
 *
 * OSM は廃業した店を消さずに disused:amenity / was:amenity などに付け替える慣習がある。
 * これを1リクエストで引ければ、閉店の一次スクリーニングになる。
 * 結果は tools/osm_closed.json。audit_closed.js が読む。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'osm_closed.json');
const BBOX = '26.0,127.5,26.95,128.4';

const QUERY = `[out:json][timeout:300];
(
  nwr["disused:amenity"]["name"](${BBOX});
  nwr["was:amenity"]["name"](${BBOX});
  nwr["disused:shop"]["name"](${BBOX});
  nwr["was:shop"]["name"](${BBOX});
  nwr["abandoned:amenity"]["name"](${BBOX});
  nwr["removed:amenity"]["name"](${BBOX});
);
out center tags;`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

(async () => {
  let data = null;
  for (const ep of ENDPOINTS) {
    try {
      process.stdout.write(`${ep} ... `);
      const res = await fetch(ep, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded',
                  'User-Agent': 'hichan-map-okinawa/1.0 (personal map; closure check)'},
        body: 'data=' + encodeURIComponent(QUERY)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
      console.log('OK');
      break;
    } catch (e) { console.log('失敗:', e.message); }
  }
  if (!data) process.exit(1);

  const rows = (data.elements || []).map(el => {
    const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
    const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
    if (lat == null || lon == null || !el.tags || !el.tags.name) return null;
    const t = el.tags;
    const kind = t['disused:amenity'] || t['was:amenity'] || t['disused:shop'] ||
                 t['was:shop'] || t['abandoned:amenity'] || t['removed:amenity'] || '';
    const how = Object.keys(t).find(k => /^(disused|was|abandoned|removed):/.test(k)) || '';
    return {name: t.name, lat, lon, kind, how};
  }).filter(Boolean);

  fs.writeFileSync(OUT, JSON.stringify(rows), 'utf8');
  console.log(`閉業として記録されたPOI ${rows.length} 件を保存しました。`);
  const byKind = {};
  rows.forEach(r => byKind[r.kind] = (byKind[r.kind] || 0) + 1);
  console.log('内訳:', Object.entries(byKind).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(' / '));
})();
