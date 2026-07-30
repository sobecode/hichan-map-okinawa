/*
 * 全店のピン位置を OSM の名前付きPOIと突き合わせて、ずれている店を洗い出す。
 *   node tools/fetch_osm.js      # 先にPOIを取得(tools/osm_pois.json)
 *   node tools/audit_pins.js            # 点検して報告するだけ
 *   node tools/audit_pins.js --fix      # しきい値を超えたものを書き換える
 *   node tools/audit_pins.js --min 300  # ずれの判定を300mにする(既定200m)
 *
 * 照合は name_match.js を使い、店名が一致した上で「同じ市町村の範囲にある」
 * POIだけを候補にする。同名チェーンを別の市で拾わないよう、まず現座標から
 * 5km以内に絞ってから名前で比べる。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {dice, metres, BAR, tokens, squash} = require('./name_match');

/*
 * 遠く離れたPOIほど「同名の別店」である確率が高い。距離に応じて必要な一致度を上げる。
 * 実際に 4.7km 先の「しにやすステーキ」が「しにやす焼き鳥 北谷店」に、
 * 4.3km 先の「くいものBar TANTO」が「くいもの市場 夢島」に一致0.75で当たった。
 */
function trusted(sim, d) {
  if (sim >= 0.99) return d <= 3000;   // 名前が実質同一。離れていても座標を信じる
  if (sim >= 0.90) return d <= 700;    // 支店表記や末尾の地名だけの差
  /*
   * 語の共有だけ(0.75)では座標の根拠にしない。実際に
   * 「ロインズ 松山店」→「キャプテンズ イン」(597m)、
   * 「おんな食堂」→「おんなまつり」(530m)、
   * 「Chatan Burger Base Atabii's」→「蒸気海鮮 Chatan Steam Seafood」(529m)
   * が近距離でも別店だった。近さは同一性の証明にならない。
   */
  return false;
}

// 「食堂」「そば」だけのPOI名は店の識別に使えない(OSMには名前が業態だけの登録がある)
function isGenericName(name) {
  return tokens(name).length === 0;
}

const INDEX = path.join(__dirname, '..', 'index.html');
const FIX = process.argv.includes('--fix');
const minIdx = process.argv.indexOf('--min');
const MIN_MOVE = minIdx > -1 ? Number(process.argv[minIdx + 1]) : 200;
const SEARCH_RADIUS = 5000; // この範囲のPOIだけを候補にする

const pois = JSON.parse(fs.readFileSync(path.join(__dirname, 'osm_pois.json'), 'utf8'));
const html = fs.readFileSync(INDEX, 'utf8');
const shops = eval(html.match(/const shops\s*=\s*(\[[\s\S]*?\]);/)[1]);

const results = [];
shops.forEach(s => {
  // 現座標の近傍だけを見る。遠くの同名店を拾わないための一次フィルタ
  const near = pois.filter(p => Math.abs(p.lat - s.lat) < 0.05 && Math.abs(p.lon - s.lng) < 0.05)
                   .map(p => ({p, d: metres(s.lat, s.lng, p.lat, p.lon)}))
                   .filter(x => x.d <= SEARCH_RADIUS);
  const scored = near
    .filter(x => squash(x.p.name) === squash(s.n) || !isGenericName(x.p.name))
    .map(x => ({...x, sim: Math.max(dice(s.n, x.p.name), x.p.nameJa ? dice(s.n, x.p.nameJa) : 0)}))
    .filter(x => x.sim >= BAR)
    .sort((a, b) => (b.sim - a.sim) || (a.d - b.d));

  if (!scored.length) return;
  const top = scored[0];
  // 同点の候補が別の場所にあるなら、どちらが正しいか決められないので保留
  const tied = scored.filter(x => x.sim >= top.sim - 0.001 && metres(x.p.lat, x.p.lon, top.p.lat, top.p.lon) > 100);
  results.push({s, top, ambiguous: tied.length > 0, cands: scored.length,
                trusted: trusted(top.sim, top.d)});
});

const decimals = v => { const d = String(v).split('.')[1]; return d ? d.length : 0; };
const off = results.filter(r => r.top.d >= MIN_MOVE);
const ok = results.filter(r => r.top.d < MIN_MOVE);
const untrusted = off.filter(r => !r.trusted);
const amb = off.filter(r => r.trusted && r.ambiguous);
const fixable = off.filter(r => r.trusted && !r.ambiguous);

console.log(`全 ${shops.length} 店のうち OSM に一致するPOIが見つかったのは ${results.length} 店`);
console.log(`  ${MIN_MOVE}m 未満(問題なし): ${ok.length} 店`);
console.log(`  ${MIN_MOVE}m 以上ずれ: ${off.length} 店`);
console.log(`    修正候補: ${fixable.length} 店 / 候補複数で保留: ${amb.length} 店 / 遠すぎて別店と判断: ${untrusted.length} 店\n`);

fixable.sort((a, b) => b.top.d - a.top.d);
console.log(`--- ${MIN_MOVE}m 以上ずれている店 (ずれの大きい順) ---`);
fixable.forEach(r => {
  const s = r.s, t = r.top;
  console.log(`${String(t.d).padStart(5)}m  ${s.n} 〔${s.a}/${s.g}〕 一致${t.sim.toFixed(2)} 小数${Math.min(decimals(s.lat), decimals(s.lng))}桁`);
  console.log(`         現在 ${s.lat}, ${s.lng}  →  OSM「${t.p.name}」${t.p.lat}, ${t.p.lon} (${t.p.kind})`);
});

if (amb.length) {
  console.log(`\n--- 候補が複数あり保留 (手で判断が必要) ---`);
  amb.forEach(r => console.log(`${String(r.top.d).padStart(5)}m  ${r.s.n} 〔${r.s.a}〕 候補${r.cands}件 例:「${r.top.p.name}」`));
}

if (untrusted.length) {
  console.log(`\n--- 採用しない (名前の一致が弱い、または離れすぎ) ---`);
  untrusted.sort((a, b) => b.top.d - a.top.d).forEach(r =>
    console.log(`${String(r.top.d).padStart(5)}m  ${r.s.n} 〔${r.s.a}〕 一致${r.top.sim.toFixed(2)} vs OSM「${r.top.p.name}」`));
}

if (FIX) {
  const byKey = new Map(fixable.map(r => [r.s.n + '|' + r.s.a, r.top]));
  const lines = html.split('\n');
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (!/^\s*\{n:'/.test(L)) continue;
    const nm = (/\{n:'((?:[^'\\]|\\.)*)'/.exec(L) || [])[1];
    const a = (/,a:'((?:[^'\\]|\\.)*)'/.exec(L) || [])[1];
    if (nm == null || a == null) continue;
    const t = byKey.get(nm.replace(/\\'/g, "'") + '|' + a.replace(/\\'/g, "'"));
    if (!t) continue;
    const out = L.replace(/lat:-?[\d.]+,lng:-?[\d.]+,/,
      `lat:${Number(t.p.lat).toFixed(6)},lng:${Number(t.p.lon).toFixed(6)},`);
    if (out === L) { console.log('★lat/lng を置換できない行:', nm); process.exit(1); }
    lines[i] = out;
    n++;
  }
  fs.writeFileSync(INDEX, lines.join('\n'), 'utf8');
  console.log(`\n${n} 店の座標を書き換えました。`);
} else {
  console.log('\n(書き換えるには --fix を付けて実行)');
}
