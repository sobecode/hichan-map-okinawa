/*
 * 沖縄本島の「名前付き飲食店POI」を Overpass API から一括取得して tools/osm_pois.json に保存する。
 *   node tools/fetch_osm.js
 *
 * Nominatim を店名で1件ずつ引くと1秒1件の制限で747回=13分かかる上に、
 * 検索語の解釈に左右される。Overpass なら1リクエストで全POIが取れて、
 * 名前の突き合わせは手元の name_match.js に任せられる。
 * 取得結果はキャッシュ扱い。audit_pins.js が読む。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'osm_pois.json');
// 沖縄本島＋周辺離島(久高島・瀬長島など)が入る範囲
const BBOX = '26.0,127.5,26.95,128.4';

const AMENITY = 'restaurant|cafe|fast_food|bar|pub|ice_cream|biergarten|food_court';
const SHOP = 'bakery|confectionery|pastry|coffee|tea|deli|seafood|butcher|greengrocer';

const QUERY = `[out:json][timeout:300];
(
  nwr["name"]["amenity"~"^(${AMENITY})$"](${BBOX});
  nwr["name"]["shop"~"^(${SHOP})$"](${BBOX});
  nwr["name"]["tourism"="hotel"]["cuisine"](${BBOX});
);
out center tags;`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

(async () => {
  let data = null, lastErr = null;
  for (const ep of ENDPOINTS) {
    try {
      process.stdout.write(`${ep} に問い合わせ中... `);
      const res = await fetch(ep, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded',
                  'User-Agent': 'hichan-map-okinawa/1.0 (personal map; pin verification)'},
        body: 'data=' + encodeURIComponent(QUERY)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      console.log('OK');
      break;
    } catch (e) { console.log('失敗:', e.message); lastErr = e; }
  }
  if (!data) { console.error('すべてのエンドポイントで失敗しました:', lastErr && lastErr.message); process.exit(1); }

  const pois = (data.elements || []).map(el => {
    const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
    const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
    if (lat == null || lon == null || !el.tags || !el.tags.name) return null;
    return {
      name: el.tags.name,
      nameJa: el.tags['name:ja'] || null,
      lat, lon,
      kind: el.tags.amenity || el.tags.shop || el.tags.tourism || '',
      addr: [el.tags['addr:city'], el.tags['addr:quarter'], el.tags['addr:neighbourhood']].filter(Boolean).join('') || null
    };
  }).filter(Boolean);

  fs.writeFileSync(OUT, JSON.stringify(pois), 'utf8');
  console.log(`名前付きPOI ${pois.length} 件を ${OUT} に保存しました。`);
  const byKind = {};
  pois.forEach(p => byKind[p.kind] = (byKind[p.kind] || 0) + 1);
  console.log('種別:', Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' / '));
})();
