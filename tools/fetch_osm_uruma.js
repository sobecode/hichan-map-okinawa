// 本部町・今帰仁村・古宇利島の名前付きPOIを Overpass から一括取得
const fs = require('fs');
const q = `[out:json][timeout:90];
(
  nwr["name"]["amenity"~"restaurant|cafe|fast_food|ice_cream|bar|pub|food_court"](26.28,127.78,26.46,128.00);
  nwr["name"]["tourism"~"hotel|resort|attraction|viewpoint|information"](26.28,127.78,26.46,128.00);
  nwr["name"]["shop"~"bakery|confectionery|convenience"](26.28,127.78,26.46,128.00);
);
out center tags;`;
(async () => {
  const res = await fetch('https://overpass.kumi.systems/api/interpreter', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'hichan-map-okinawa/1.0 (personal Okinawa restaurant guide; sobecode@gmail.com)'},
    body: 'data=' + encodeURIComponent(q)
  });
  const j = await res.json();
  const out = j.elements.map(e => ({
    name: e.tags.name,
    en: e.tags['name:en'] || null,
    lat: e.lat ?? e.center?.lat,
    lng: e.lon ?? e.center?.lon,
    kind: e.tags.amenity || e.tags.tourism || e.tags.shop,
  })).filter(o => o.lat);
  fs.writeFileSync(__dirname + '/osm_uruma.json', JSON.stringify(out, null, 1));
  console.log('POIs:', out.length);
})();
