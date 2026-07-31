/*
 * 全店の座標を GSI の逆ジオコーダに通し、実際に落ちる市町村・字を調べて
 * 店の a 表記と突き合わせる。742店すべてを見られる唯一の検査。
 *   node tools/audit_muni.js            # 取得(キャッシュ済みは飛ばす)して報告
 *   node tools/audit_muni.js --report   # 取得せずキャッシュだけで報告
 *
 * 見るのは3点:
 *  (1) 海に落ちている — GSIは陸地の外だと results:null を返す。国土地理院の
 *      公式データなので埋立地を正しく陸として扱う。is-on-water が北谷美浜で
 *      砂浜まで「海」と返したのとは違い、ここは信用できる。
 *  (2) a の市町村と実際の市町村が食い違う — 「別の市に置かれている」取り違え。
 *      この誤りは過去に3件見つかっている(ながどう家/Bookcafe/お肉の台所1129)。
 *  (3) a に字まで書いてある店で、実際の字が違う — 市内での置き間違い。
 *
 * 取得結果は tools/reverse_geo.json に貯めるので、再実行は差分だけになる。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPORT_ONLY = process.argv.includes('--report');
const INDEX = path.join(__dirname, '..', 'index.html');
const CACHE = path.join(__dirname, 'reverse_geo.json');
const MUNI = path.join(__dirname, 'muni_codes.json');

const html = fs.readFileSync(INDEX, 'utf8');
const shops = eval(html.match(/const shops\s*=\s*(\[[\s\S]*?\]);/)[1]);
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = s => s.lat + ',' + s.lng;

async function muniTable() {
  if (fs.existsSync(MUNI)) return JSON.parse(fs.readFileSync(MUNI, 'utf8'));
  const js = await (await fetch('https://maps.gsi.go.jp/js/muni.js')).text();
  const t = {};
  // GSI.MUNI_ARRAY["47201"] = '47,沖縄県,47201,那覇市';
  for (const m of js.matchAll(/MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']+)'/g)) {
    const parts = m[2].split(',');
    t[m[1]] = {pref: parts[1], city: parts[3]};
  }
  fs.writeFileSync(MUNI, JSON.stringify(t), 'utf8');
  return t;
}

async function fetchAll() {
  const todo = shops.filter(s => !(key(s) in cache));
  if (!todo.length) { console.log('取得済み。キャッシュを使います。\n'); return; }
  console.log(`GSI逆ジオコーダに ${todo.length} 件を問い合わせます(約${Math.ceil(todo.length * 0.35 / 60)}分)\n`);
  for (let i = 0; i < todo.length; i++) {
    const s = todo[i];
    let got = null;
    for (let attempt = 0; attempt < 3 && got === null; attempt++) {
      try {
        const url = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${s.lat}&lon=${s.lng}`;
        const r = await fetch(url, {headers: {'User-Agent': 'hichan-map pin audit (personal site)'}});
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        got = j.results || false;   // 海なら {} が返るので false を入れて区別する
      } catch (e) {
        if (attempt === 2) { console.error(`  取得失敗 ${s.n}: ${e.message}`); }
        else await sleep(1500);
      }
    }
    if (got !== null) cache[key(s)] = got;
    if ((i + 1) % 50 === 0) {
      fs.writeFileSync(CACHE, JSON.stringify(cache), 'utf8');
      console.log(`  ${i + 1}/${todo.length}`);
    }
    await sleep(320);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache), 'utf8');
  console.log('取得完了\n');
}

/* a は「豊見城市/豊崎」「恩納村」「南城市/久高島」のような形。市町村部分を取り出す */
const cityOf = a => String(a).split('/')[0].trim();
const wardOf = a => { const p = String(a).split('/'); return p.length > 1 ? p[1].trim() : null; };

/*
 * 字の比較は表記ゆれに寛容にする。ここを緩めないと大量の空振りが出る:
 *  - GSIは「豊崎」に対し「豊崎一丁目」のように丁目付きを返す
 *  - こちらの a は「玉城前川」、GSIは「玉城字前川」と書く(字が語中に入る)
 *  - こちらが「久高島」、GSIは「知念字久高」のように島名と大字がずれる
 * どちらかがもう一方を含んでいれば同じ場所とみなす。
 */
function wardMatches(mine, theirs) {
  if (!mine || !theirs) return true;
  const norm = x => String(x).replace(/[ 　]/g, '')
    .replace(/字/g, '').replace(/[一二三四五六七八九十]+丁目$/, '').replace(/島$/, '');
  const a = norm(mine), b = norm(theirs);
  return a === b || a.includes(b) || b.includes(a);
}

(async () => {
  const table = await muniTable();
  if (!REPORT_ONLY) await fetchAll();

  const sea = [], wrongCity = [], wrongWard = [], missing = [];
  for (const s of shops) {
    const r = cache[key(s)];
    if (r === undefined) { missing.push(s); continue; }
    if (r === false || !r.muniCd) { sea.push(s); continue; }
    const t = table[String(Number(r.muniCd))] || table[r.muniCd];
    const actualCity = t ? t.city : '(コード' + r.muniCd + ')';
    const myCity = cityOf(s.a);
    if (actualCity !== myCity) wrongCity.push({s, actualCity, ward: r.lv01Nm});
    else if (!wardMatches(wardOf(s.a), r.lv01Nm)) wrongWard.push({s, ward: r.lv01Nm});
  }

  console.log(`=== (1) 陸地の外に落ちている座標: ${sea.length}店 ===`);
  sea.forEach(s => console.log(`  ${s.n} 〔${s.a}〕 ${s.lat}, ${s.lng}`));

  console.log(`\n=== (2) a と実際の市町村が違う: ${wrongCity.length}店 ===`);
  wrongCity.forEach(x => console.log(
    `  ${x.s.n} 〔${x.s.a}〕 → 実際は ${x.actualCity}${x.ward ? ' ' + x.ward : ''}  ${x.s.lat}, ${x.s.lng}`));

  console.log(`\n=== (3) 市町村は合うが字が違う: ${wrongWard.length}店 ===`);
  wrongWard.forEach(x => console.log(`  ${x.s.n} 〔${x.s.a}〕 → 実際は ${x.ward}  ${x.s.lat}, ${x.s.lng}`));

  if (missing.length) console.log(`\n未取得: ${missing.length}店`);
  console.log(`\n照合できた: ${shops.length - missing.length} / ${shops.length}店`);
})();
