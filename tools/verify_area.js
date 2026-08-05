// 指定 area_id の全ピンを GSI 逆ジオコーダに掛け、市町村と字が `a` ラベルと一致するか調べる
const fs = require('fs');
const h = fs.readFileSync('C:/Users/kinta/hichan-map/index.html', 'utf8');
const shops = eval(h.match(/const shops\s*=\s*(\[[\s\S]*?\n\s*\]);/)[1]);
const areas = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let muniCd = {};
  const mj = await (await fetch('https://maps.gsi.go.jp/js/muni.js')).text();
  mj.replace(/GSI\.MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']*)'/g, (_, cd, v) => {
    const parts = v.split(','); muniCd[cd] = (parts[3] || '').trim(); return '';
  });
  let bad = 0, n = 0;
  for (const s of shops.filter(x => areas.includes(x.area_id))) {
    n++;
    const r = await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${s.lat}&lon=${s.lng}`);
    const j = await r.json();
    const cd = j.results && j.results.muniCd, lv = (j.results && j.results.lv01Nm) || '';
    const got = cd ? (muniCd[cd] || cd) : '（陸地外）';
    const wantMuni = s.a.split('/')[0];
    const wantAza = (s.a.split('/')[1] || '').replace(/[０-９0-9丁目]/g, '');
    const muniOk = got === wantMuni;
    const azaOk = !wantAza || lv.replace(/字/g, '').includes(wantAza.replace(/字/g, ''));
    if (!muniOk || !azaOk) { bad++; console.log('NG  ' + s.n + ' | 期待:' + s.a + ' 実際:' + got + ' ' + lv); }
    await sleep(330);
  }
  console.log(`--- ${n}件中 要確認 ${bad}件 ---`);
})();
