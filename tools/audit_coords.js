/*
 * OSM に載っていない店も含めた、座標そのものの構造的な点検。
 *   node tools/audit_coords.js
 *
 * 見るのは3点:
 *  (a) 同一座標の共有 — 同じ建物なら正常だが、ジャンルの違う店が小数7桁まで一致するのは
 *      コピペの疑い。施設名を共有しているかどうかで仕分けて出す。
 *  (b) 小数3桁以下 — 一度も地理コーディングされていない手置きの座標。
 *  (c) 自分の a(市町村/字)から離れすぎ — GSIで a の中心を引いて距離を測る。
 *      別の市町村に置かれている取り違えを拾うのが目的。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {metres, squash} = require('./name_match');

const INDEX = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX, 'utf8');
const shops = eval(html.match(/const shops\s*=\s*(\[[\s\S]*?\]);/)[1]);
const CACHE = path.join(__dirname, 'district_centroids.json');
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

const decimals = v => { const d = String(v).split('.')[1]; return d ? d.length : 0; };
const prec = s => Math.min(decimals(s.lat), decimals(s.lng));

// (a) 同一座標
console.log('=== (a) 同一座標を共有している組 ===');
const groups = {};
shops.forEach(s => { const k = s.lat + '_' + s.lng; (groups[k] || (groups[k] = [])).push(s); });
const shared = Object.entries(groups).filter(([, v]) => v.length > 1);
// 施設名らしい共通語(ウミカジテラス等)を持つ組は同一建物として扱う
const FACILITY = /ウミカジテラス|あしびなー|イーアス|道の駅|おんなの駅|物産センター|ホテル|リゾート|ハレクラニ|ブセナ|アメリカンビレッジ|お魚センター|市場|フードコート|空港|パルコ|デポアイランド/;
let suspicious = 0;
shared.forEach(([k, v]) => {
  const names = v.map(s => s.n);
  const facility = names.filter(n => FACILITY.test(n)).length >= Math.ceil(v.length / 2);
  const genres = new Set(v.map(s => s.g));
  const flag = !facility && genres.size > 1;
  if (flag) suspicious++;
  console.log(`${flag ? '★疑わしい' : '  同一建物か'} ${k} (${v.length}店, ジャンル${genres.size}種)`);
  console.log(`     ${names.join(' / ')}`);
});
console.log(`\n同一座標の組 ${shared.length} / うち施設名の裏付けがなくジャンルも違う組 ${suspicious}\n`);

// (b) 小数3桁以下
const rough = shops.filter(s => prec(s) <= 3);
console.log(`=== (b) 小数3桁以下(地理コーディングされていない手置き座標): ${rough.length}店 ===`);
rough.forEach(s => console.log(`  ${prec(s)}桁  ${s.n} 〔${s.a}〕 ${s.lat}, ${s.lng}`));

// (c) a の中心からの距離
(async () => {
  const areas = [...new Set(shops.map(s => s.a))];
  const need = areas.filter(a => !(a in cache));
  if (need.length) {
    console.log(`\nGSIで ${need.length} 件の地域中心を取得中...`);
    for (const a of need) {
      // 「名護市/大南」→「沖縄県名護市大南」の形にする
      const q = '沖縄県' + a.replace(/\//g, '');
      try {
        const r = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q));
        const d = await r.json();
        cache[a] = d.length ? {lat: d[0].geometry.coordinates[1], lng: d[0].geometry.coordinates[0],
                               title: d[0].properties.title} : null;
      } catch (e) { cache[a] = null; }
      await new Promise(x => setTimeout(x, 400));
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1), 'utf8');
  }

  const far = [];
  shops.forEach(s => {
    const c = cache[s.a];
    if (!c) return;
    const d = metres(s.lat, s.lng, c.lat, c.lng);
    if (d >= 3000) far.push({s, d, c});
  });
  far.sort((a, b) => b.d - a.d);
  console.log(`\n=== (c) 自分の a の中心から3km以上離れている: ${far.length}店 ===`);
  console.log('(a が広い市町村名だけの店は中心が遠くなりがちなので、字まで入っている店ほど疑わしい)');
  far.forEach(r => console.log(`  ${(r.d / 1000).toFixed(1)}km  ${r.s.n} 〔${r.s.a}〕 ${r.s.lat}, ${r.s.lng}  中心「${r.c.title}」`));

  const noCentroid = [...new Set(shops.filter(s => !cache[s.a]).map(s => s.a))];
  if (noCentroid.length) console.log(`\nGSIで中心が取れなかった a: ${noCentroid.join(' / ')}`);
})();
