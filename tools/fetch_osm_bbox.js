// 指定 bbox の名前付きPOI（飲食＋観光施設＋店）を Overpass から取得する
const fs = require('fs');
const [bbox, outName] = process.argv.slice(2);
const q = `[out:json][timeout:120];
(
  nwr["name"]["amenity"~"restaurant|cafe|fast_food|ice_cream|bar|pub|food_court"](${bbox});
  nwr["name"]["tourism"~"hotel|resort|attraction|viewpoint|information|museum"](${bbox});
  nwr["name"]["shop"~"bakery|confectionery|convenience|farm|deli"](${bbox});
  nwr["name"]["amenity"="marketplace"](${bbox});
);
out center tags;`;
(async () => {
  const res = await fetch('https://overpass.kumi.systems/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'hichan-map-okinawa/1.0 (personal Okinawa restaurant guide; sobecode@gmail.com)'
    },
    body: 'data=' + encodeURIComponent(q)
  });
  const text = await res.text();
  if (!text.trim().startsWith('{')) { console.error('Overpass error:', text.slice(0, 1600)); process.exit(1); }
  const j = JSON.parse(text);
  const out = j.elements.map(e => ({
    name: e.tags.name, en: e.tags['name:en'] || null,
    lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon,
    kind: e.tags.amenity || e.tags.tourism || e.tags.shop,
  })).filter(o => o.lat);
  fs.writeFileSync(__dirname + '/' + outName, JSON.stringify(out, null, 1));
  console.log(outName, 'POIs:', out.length);
})();
