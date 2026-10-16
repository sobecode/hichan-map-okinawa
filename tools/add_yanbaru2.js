/*
 * やんばる(国頭村)の深掘り 2026-10-16。食べログ評価順で未収録・口コミ10件以上の16店。
 *   node tools/add_yanbaru2.js [--dry]
 * 座標は食べログ店舗ページの地図の中心(tools/detail_rank_47301.json)。
 * 16店すべて GSI逆ジオコーダの字が住所の字と一致することを確認済み。
 * 説明・名物は食べログのピックアップ口コミに書かれている事実だけから書いた。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DRY = process.argv.includes('--dry');
const P = path.join(__dirname, '..', 'index.html');
const detail = require('./detail_rank_47301.json');

// [店名, g, 字, 説明, 名物, 営業時間の上書き(nullならdetailのまま), [[tag,ラベル]...], badges]
const ROWS = [
  ['精気小屋', 'washoku', '宜名真', '大石林山の中にある食事処。薬草入りのぼろぼろジューシーや沖縄そばで、散策の前後に一息つける。', 'ぼろぼろジューシー / 沖縄そば', null, [['local', '大石林山'], ['lunch', '食堂']]],
  ['ふれあい食堂 なんと屋', 'washoku', '宜名真', '大石林山（アスムイハイクス）の2階にある食堂。山羊そばや薬草のじゅーしーが食べられる。', 'やぎそば / ぼろぼろじゅーしー', '11:00〜16:00', [['local', '大石林山'], ['lunch', '食堂']]],
  ['やんばるジェラート ASMUI店', 'sweets', '宜名真', '大石林山の施設内にあるジェラート店。ジェラート大会優勝者が考えた、沖縄のフルーツを使った味がそろう。', 'プレミアムミルク / 沖縄フルーツのジェラート', null, [['sweets', 'ジェラート'], ['local', '大石林山']]],
  ['奥やんばる食堂', 'soba', '奥', '本島最北の集落・奥の「奥ヤンバルの里」にある食堂。沖縄そばと肉厚のアジフライ定食。', '沖縄そば / アジフライ定食', null, [['soba', '沖縄そば'], ['lunch', '食堂']]],
  ['サツキ丸', 'seafood', '奥', '奥の共同店の隣にある天ぷらと刺身の店。そば・天ぷら・刺身がつく定食や、ハイビスカスの天ぷらが名物。', '沖縄そば定食 / ハイビスカスの天ぷら', null, [['local', '天ぷら'], ['lunch', '定食']]],
  ['まるひら食堂', 'washoku', '宇嘉', '宇嘉共同店の中にある食堂。巨大な唐揚げの「げんこつ定食」と、にんにくたっぷりの「にんみんライス」が名物。', 'げんこつ定食 / にんみんライス', null, [['lunch', '食堂'], ['local', 'デカ盛り']]],
  ['食堂 ひまわり', 'soba', '鏡地', 'オクマビーチの入口近くにある老舗の沖縄そば食堂。ホロホロのソーキそばが手ごろな値段で食べられる。', 'ソーキそば / 沖縄そば', null, [['soba', '沖縄そば'], ['local', '老舗']]],
  ['ビーチサイド', 'yakiniku', '奥間', 'オクマプライベートビーチ＆リゾートの浜辺にあるバーベキューレストラン。手ぶらで夕日を見ながら焼ける。', 'バーベキュー', null, [['dinner', 'BBQ'], ['view', 'ビーチ']]],
  ['ヤキニクライオン オクマ', 'yakiniku', '奥間', 'オクマビーチ近くの焼肉店。県産A5黒毛和牛の雌牛だけを使う。', '県産黒毛和牛の焼肉', null, [['dinner', '焼肉'], ['steak', '黒毛和牛']]],
  ['とり屋 Twie', 'ramen', '奥間', '道の駅ゆいゆい国頭にある廃鶏専門店。廃鶏の出汁に鰹節を効かせたラー麺が評判。店名は方言で「鳥」。', '廃鶏のラー麺', null, [['lunch', 'ラーメン'], ['local', '道の駅']]],
  ['パーラーゆめちゃん', 'sweets', '奥間', '道の駅ゆいゆい国頭のフードコートにあるパーラー。かき氷のほか、じゅーしーのおにぎりや天ぷらも。', 'かき氷 / じゅーしーおにぎり', null, [['sweets', 'かき氷'], ['local', '道の駅']]],
  ['まるとみ鮮魚かまぼこ店', 'seafood', '奥間', '道の駅ゆいゆい国頭に併設の鮮魚店。その場で捌く刺身の盛り合わせが格安。', '刺身盛り合わせ / かまぼこ', null, [['local', '鮮魚店'], ['lunch', '刺身']]],
  ['レストハウス 浜風', 'washoku', '浜', '国頭村浜の通り沿いにある食堂。にんにくソースの効いたステーキ丼が名物で、地元の人が通う。', 'ステーキ丼', null, [['lunch', '食堂'], ['steak', 'ステーキ丼']]],
  ['びすとろ海畑', 'izakaya', '辺土名', '辺土名のアットホームなビストロ。やんばるの食材を使った沖縄料理と創作料理が楽しめる。', 'ゴーヤーチャンプルー / 豚ロースのステーキ', null, [['dinner', 'ビストロ'], ['local', '沖縄料理']]],
  ['宮里菓子店', 'sweets', '辺土名', '辺土名の集落にある昔ながらのケーキ屋。素朴なドーナツとパウンドケーキが手土産に人気。', 'ドーナツ / パウンドケーキ', null, [['sweets', '洋菓子'], ['local', '老舗']]],
  ['鮨 はなぜん', 'washoku', '辺土名', '辺土名の寿司屋。沖縄近海のネタを良心的な値段で握り、居酒屋メニューも豊富。地元の人のイチオシ。', '寿司 / 夜光貝', null, [['dinner', '寿司'], ['local', '地元人気']]],
];

const esc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const lines = ROWS.map(([n, g, aza, d, r, hOver, tags]) => {
  const x = detail.find(v => v.name === n);
  if (!x) throw new Error('detail に無い: ' + n);
  if (x.status !== 'open') throw new Error('営業中でない: ' + n + ' ' + x.status);
  if (!x.gsi || !x.gsi.replace(/^字/, '').startsWith(aza)) throw new Error(`字が合わない: ${n} ${aza} / GSI ${x.gsi}`);
  const h = hOver != null ? hOver : (x.h || '');
  const tg = tags.map(([c, l]) => `<span class="tag tag-${c}">${l}</span>`).join('');
  return `  {n:'${esc(n)}',g:'${g}',a:'国頭村/${aza}',area_id:'yanbaru',lat:${x.lat},lng:${x.lng},tb:${x.tb},tbc:${x.tbc},tl:'${x.tl}',d:'${esc(d)}',r:'${esc(r)}',h:'${esc(h)}',tags:'${tg}',badges:''},`;
});

let src = fs.readFileSync(P, 'utf8');
const nl = src.includes('\r\n') ? '\r\n' : '\n';
const arr = src.split(/\r?\n/);
const names = new Set(ROWS.map(r => r[0]));
if (arr.some(l => [...names].some(n => l.startsWith(`  {n:'${esc(n)}',`)))) throw new Error('すでに入っている店がある');
// 国頭村の最後の行の直後に入れる(エリア内の並びは 国頭→大宜味→東)
let last = -1;
arr.forEach((l, i) => { if (l.includes("area_id:'yanbaru'") && l.includes("a:'国頭村/")) last = i; });
if (last < 0) throw new Error('国頭村の行が見つからない');
arr.splice(last + 1, 0, ...lines);
console.log(`${lines.length}店を ${last + 2} 行目に追加`);
if (!DRY) {
  fs.writeFileSync(P, arr.join(nl));
  // apply_tabelog.js は tb を全消しして tabelog.json から付け直すので、こちらにも行を足す
  const tj = path.join(__dirname, 'tabelog.json');
  const t = JSON.parse(fs.readFileSync(tj, 'utf8'));
  let added = 0;
  for (const [n] of ROWS) {
    const x = detail.find(v => v.name === n);
    if (t.some(r => r.area_id === 'yanbaru' && r.name === n)) continue;
    t.push({area_id: 'yanbaru', name: n, score: x.tb, count: x.tbc}); added++;
  }
  fs.writeFileSync(tj, JSON.stringify(t, null, 1));
  console.log(`tabelog.json に ${added} 行`);
}
