// `a` が市町村名だけの店に、GSI 逆ジオコーダで字を足す（--apply で index.html を書き換え）
// 表記は既存に合わせ、丁目と数字は落とす（例「牧志三丁目」→「牧志」）。
const fs = require('fs');
const P = 'C:/Users/kinta/hichan-map/index.html';
const APPLY = process.argv.includes('--apply');
const CACHE = __dirname + '/_aza_cache.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const KAN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const toLabel = lv => {
  let t = (lv || '')
    .replace(/字/g, '')                       // 「玉城字前川」→「玉城前川」（既存表記に合わせる）
    .replace(new RegExp('[' + Object.keys(KAN).join('') + '０-９0-9]*丁目$'), '')
    .trim();
  const half = t.slice(0, t.length / 2);       // 「知念知念」→「知念」
  if (t.length % 2 === 0 && half && t === half + half) t = half;
  return t;
};

(async () => {
  const h0 = fs.readFileSync(P, 'utf8');
  const shops = eval(h0.match(/const shops\s*=\s*(\[[\s\S]*?\n\];)/)[1]);
  const targets = shops.filter(s => !s.a.includes('/'));

  const muniCd = {};
  const mj = await (await fetch('https://maps.gsi.go.jp/js/muni.js')).text();
  mj.replace(/GSI\.MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']*)'/g, (_, cd, v) => { muniCd[cd] = (v.split(',')[3] || '').trim(); return ''; });

  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const fills = [], skips = [];
  for (const s of targets) {
    const key = s.lat + ',' + s.lng;
    if (!cache[key]) {
      let j = {};
      try { j = await (await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${s.lat}&lon=${s.lng}`)).json(); } catch (e) {}
      cache[key] = j.results ? { cd: j.results.muniCd, lv: j.results.lv01Nm } : null;
      await sleep(340);
    }
    const r = cache[key];
    if (!r) { skips.push([s.n, s.a, '陸地外（桟橋・マリーナなど）']); continue; }
    const gotMuni = muniCd[r.cd] || r.cd;
    if (gotMuni !== s.a) { skips.push([s.n, s.a, '市町村が食い違う → ' + gotMuni + ' ' + r.lv]); continue; }
    const aza = toLabel(r.lv);
    if (!aza) { skips.push([s.n, s.a, '字が空']); continue; }
    fills.push({ n: s.n, from: s.a, to: s.a + '/' + aza });
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache), 'utf8');

  console.log('=== 字を足せる: ' + fills.length + ' 件 ===');
  fills.forEach(f => console.log('  ' + f.from + ' → ' + f.to + '   (' + f.n + ')'));
  console.log('\n=== 見送り: ' + skips.length + ' 件 ===');
  skips.forEach(x => console.log('  ' + x[0] + ' 〔' + x[1] + '〕 ' + x[2]));

  if (!APPLY) { console.log('\n(--apply で書き込み)'); return; }

  let h = h0, changed = 0;
  for (const f of fills) {
    // 対象の1行だけを、店名で特定して書き換える
    const esc = f.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp("(\\{n:'" + esc + "',g:'[a-z]+',a:')" + f.from + "(')", 'g');
    const hit = h.match(re);
    if (!hit) { console.log('!! 行が見つからない: ' + f.n); continue; }
    if (hit.length > 1) { console.log('!! 同名が複数あるので手動: ' + f.n); continue; }
    h = h.replace(re, '$1' + f.to + '$2');
    changed++;
  }
  if (changed === 0) throw new Error('no change');
  fs.writeFileSync(P, h, 'utf8');
  console.log('\n書き換え: ' + changed + ' 件');
})();
