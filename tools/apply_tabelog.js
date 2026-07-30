/*
 * 食べログの点数を index.html の tb / tbc に反映する。
 *
 *   node tools/apply_tabelog.js --dry     # 反映内容を表示するだけ
 *   node tools/apply_tabelog.js
 *
 * 入力は tools/tabelog.json:
 *   [{"area_id":"naha","name":"BACAR","score":4.06,"count":933}, ...]
 * 食べログの都市別ランキング(https://tabelog.com/okinawa/C47201/rstLst/N/?Srt=D&SrtT=rt)から
 * 集めた生データで、area_id はそのページの市町村に対応する当サイトのエリアID。
 *
 * 照合は name_match.js に任せ、同じ area_id の店だけを候補にする。
 * 同点が並んだ場合(同ブランドの別支店など)はどちらとも決めずに保留する。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {bestMatch} = require('./name_match');

const INDEX = path.join(__dirname, '..', 'index.html');
const DRY = process.argv.includes('--dry');
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'tabelog.json'), 'utf8'));

const html = fs.readFileSync(INDEX, 'utf8');
const shops = eval(html.match(/const shops\s*=\s*(\[[\s\S]*?\]);/)[1]);

// area_id ごとに候補をまとめ、店名→点数 の対応を決める
const byArea = {};
shops.forEach(s => (byArea[s.area_id] || (byArea[s.area_id] = [])).push(s));

/*
 * 自動照合は通るが、目で見て同じ店とは言い切れない組。
 * 「食べログ側の名前」→ 理由。ここに入れた行は反映しない。
 */
const EXCLUDE = {
  'ふくろう亭': '当サイトの「焼肉ふくろう」と屋号が近いだけで、業態が違う別店の可能性が高い',
  'サムズアンカーイン イーアス沖縄豊崎店': '当サイトの「サムズレストラン」がこの支店を指すか確定できない',
  'エランド': '当サイトの「エラン」と同一かどうか、住所が公開されていないため確認できない'
};

const assign = new Map(); // "name|a" -> {score, count, from, sim}
const unmatched = [], ambiguous = [], conflicts = [], excluded = [];

rows.forEach(r => {
  if (EXCLUDE[r.name]) { excluded.push(`${r.name} — ${EXCLUDE[r.name]}`); return; }
  const pool = byArea[r.area_id] || [];
  const res = bestMatch(r.name, pool, s => s.n);
  if (!res.match) {
    (res.ambiguous ? ambiguous : unmatched).push(
      `${r.name} 〔${r.area_id}〕${res.ambiguous ? ' 同点: ' + res.tied.map(t => t.n).join(' / ') : ` (最高 ${res.sim.toFixed(2)})`}`);
    return;
  }
  const key = res.match.n + '|' + res.match.a;
  const prev = assign.get(key);
  // 同じ店に2つのランキング行が当たったときは、点数の高い方ではなく
  // 名前の一致度が高い方を採る。「伊江牛 新社屋店」に「伊江牛 糸満直売所」の点数が
  // 入ってしまうのを防ぐ(点数優先にすると起きた)
  if (prev) {
    conflicts.push(`${res.match.n}: 「${prev.from}」${prev.score}(一致${prev.sim.toFixed(2)}) / ` +
                   `「${r.name}」${r.score}(一致${res.sim.toFixed(2)}) → ` +
                   `${res.sim > prev.sim ? r.name : prev.from} を採用`);
    if (res.sim <= prev.sim) return;
  }
  assign.set(key, {score: r.score, count: r.count, from: r.name, sim: res.sim});
});

const lines = html.split('\n');
let applied = 0, changed = [];
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (!/^\s*\{n:'/.test(L)) continue;
  const n = (/\{n:'((?:[^'\\]|\\.)*)'/.exec(L) || [])[1];
  const a = (/,a:'((?:[^'\\]|\\.)*)'/.exec(L) || [])[1];
  if (n == null || a == null) continue;
  const hit = assign.get(n.replace(/\\'/g, "'") + '|' + a.replace(/\\'/g, "'"));
  if (!hit) continue;

  const tb = Number(hit.score).toFixed(2);
  const tbc = hit.count != null ? `tbc:${hit.count},` : '';
  let out = L.replace(/,tb:[\d.]+,/, ',').replace(/,tbc:\d+,/, ','); // 既存値は差し替える
  const before = out;
  // rt/rc の後、d の前に置く
  out = out.replace(/(lng:-?[\d.]+,(?:rt:[\d.]+,)?(?:rc:\d+,)?)/, `$1tb:${tb},${tbc}`);
  if (out === before) { console.log('★挿入位置が見つからない行:', n); process.exit(1); }
  if (out !== L) { applied++; changed.push(`${tb} ${n}`); }
  lines[i] = out;
}

if (!DRY) fs.writeFileSync(INDEX, lines.join('\n'), 'utf8');
console.log(`${DRY ? '[dry run] ' : ''}入力 ${rows.length} 行 → 反映 ${applied} 件`);
console.log(`照合できず ${unmatched.length} 件 / 同点保留 ${ambiguous.length} 件 / 手動除外 ${excluded.length} 件`);
if (excluded.length) {
  console.log('\n手動除外(同一店と言い切れない):');
  excluded.forEach(c => console.log('  ' + c));
}
if (conflicts.length) {
  console.log(`\n点数が食い違った ${conflicts.length} 件(高い方を採用):`);
  conflicts.forEach(c => console.log('  ' + c));
}
if (ambiguous.length) {
  console.log('\n同点で保留(手で判断が必要):');
  ambiguous.forEach(c => console.log('  ' + c));
}
if (process.argv.includes('--verbose')) {
  console.log('\n照合できなかった食べログ側の店(当サイト未収録と思われる):');
  unmatched.forEach(c => console.log('  ' + c));
}
