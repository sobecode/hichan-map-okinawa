// 候補ファイルの住所を GSI 住所検索APIで一括ジオコーディングし、番地まで解決したか判定する
const fs = require('fs');
const file = process.argv[2];
const rows = require('./' + file);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const out = [];
  let noBanchi = 0;
  for (const r of rows) {
    const [area, name, , , addr] = r;
    let rec = { area, name, addr, lat: null, lng: null, hit: null, banchi: false };
    try {
      const res = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(addr));
      const j = await res.json();
      if (j && j.length) {
        const best = j.reduce((a, b) => b.properties.title.length > a.properties.title.length ? b : a);
        rec.lng = best.geometry.coordinates[0];
        rec.lat = best.geometry.coordinates[1];
        rec.hit = best.properties.title;
        rec.banchi = /[0-9０-９]/.test(rec.hit);
      }
    } catch (e) { rec.err = String(e); }
    if (!rec.banchi) { noBanchi++; console.log('番地なし  ' + name + ' | ' + addr + ' | ' + rec.hit); }
    out.push(rec);
    await sleep(400);
  }
  fs.writeFileSync(__dirname + '/geo_' + file.replace(/^cand_|\.js$/g, '') + '.json', JSON.stringify(out, null, 1));
  console.log('--- ' + rows.length + '件中 番地まで解決: ' + (rows.length - noBanchi) + ' / 要フォロー: ' + noBanchi + ' ---');
})();
