/*
 * 店名照合のテスト。node tools/test_name_match.js
 * 「通ってほしい組」と「通ってはいけない組」の両方を並べている。
 * 後者は実際に食べログ那覇1ページ目の照合で誤マッチしたものが元になっている。
 */
'use strict';
const {dice, splitBranch, metres, bestMatch, BAR} = require('./name_match');

const should = [
  ['幸ちゃんそば', '幸ちゃんそば', '完全一致'],
  ['ZHYVAGO COFFEE WORKS', 'ZHYVAGO COFFEE WORKS OKINAWA', '末尾に地名'],
  ['琉冰 Ryu-pin（おんなの駅）', '琉冰 おんなの駅店', '読みカッコの位置違い'],
  ['沖縄そば専門店 まるち 北谷店', '沖縄そば専門店まるち 北谷店', '空白差'],
  ["Zooton's（ズートンズ）", "Zooton's 牧志店", 'カッコ＋支店名'],
  ['浜屋そば', 'そば・てびち専門店 浜屋', '正式名が長い'],
  ['まつもと（松山）', 'まつもと', 'カッコ内は地名'],
  ['とらや（木灰そば とらや）', 'とらや', 'カッコ内が正式名'],
  ['旬菜処 びいどろ', '旬菜処 びいどろ', '完全一致(空白あり)'],
  ['肉の変態集団 疾風ホルモン 久茂地本店', '肉の変態集団 疾風ホルモン 久茂地本店', '長い名前']
];

const shouldNot = [
  ["O's House", 'THE TACORICE HOUSE', 'house だけの一致'],
  ['バー アウル', 'Pink Palace アサイーボウル', 'ウル だけの一致'],
  ['ha-na', 'OKINAWA SOBA EIBUN', 'na だけの一致'],
  ['ズートンズ 久茂地店', '焼鳥 ごう 久茂地店', '同じ支店名だが別の店'],
  ['osteria due', "JUMBO STEAK HAN'S 本店", '無関係'],
  ['幸ちゃんそば', '暖暮 糸満店', '無関係'],
  ['ひがし食堂', '大東そば', '無関係'],
  ['富士家 泊本店', '富士家 国際通り松尾店', '同チェーンの別支店'],
  ['金月そば 読谷本店', '金月そば 恩納店', '同チェーンの別支店'],
  ['カフェ ロッジ', 'カフェ くるくま', 'カフェ だけの一致'],
  ['沖縄そば 峰', '沖縄そば専門店 まるち', 'ジャンル語だけの一致'],
  // 以下は食べログ照合で実際に誤マッチしたもの
  ['EL RINCON DE MEXICOLA', 'onde', '長い名前の途中に短い名前が埋まる'],
  ['EL RINCON DE MEXICOLA', 'Maison de Fujii', 'de だけの一致'],
  ['rokkan COFFEE SHURI（首里）', 'GLOUTON SHURI', '地名 SHURI だけの一致'],
  ['More Blue（モアブルー）', 'ブルー エントランス キッチン', 'ブルー だけの一致'],
  ['HAMMOCK CAFE LA ISLA（瀬長島）', 'サンルーム スイーツ 瀬長島', '地名 瀬長島 だけの一致'],
  ['ザ カリフキッチン オキナワ', 'ジバゴ コーヒー ワークス オキナワ', 'オキナワ だけの一致'],
  ['読谷山そば', '読谷 石窯ピザ酒場まるき', '地名 読谷 だけの一致'],
  ['奇跡の手羽先 アメリカンビレッジ店', 'ポーたま 北谷アメリカンビレッジ店', '施設名アメリカンビレッジだけの一致'],
  ['奇跡の手羽先 アメリカンビレッジ店', '南星 北谷アメリカンビレッジ店', '同上'],
  ['やんばるダイニング 松の古民家', 'やんばる物産センター 天ぷら店', 'やんばる だけの一致'],
  ['みはま食堂', 'ちゅらはま食堂', 'はま食堂 だけの一致']
];

/*
 * 照合では弾けない既知の限界。「シーサイド」は嘉手納の「Seaside（シーサイド）」では
 * 店名そのものなので除外語にできず、北谷の「Seaside Cafe Hanon」と
 * 「シーサイド ステーキ ビーフィーズ」は 0.75 で通ってしまう。
 * apply_tabelog.js の EXCLUDE で名前を指定して落としている。
 */

// 食べログ側の正式名とこちらの略称/併記名が対応する実例
const realPairs = [
  ['Zooton\'s（ズートンズ）', 'ズートンズ 久茂地店', '英字とカナの併記'],
  ['やちむん&カフェ 群青', 'やちむんカフェ ぐんじょう', '漢字とかな'],
  ['沖縄Diner Hi31BASE（ハイサイベース）', 'OKINAWA Diner Hi31BASE', '沖縄/OKINAWA'],
  ['チャイニーズダイニング琉華菜苑', '琉華菜苑', 'こちらが長い'],
  ['島豚七輪焼 満味', '満味', 'こちらが長い'],
  ['もずくそばのお店 くんなとぅ', 'くんなとぅ', 'こちらが長い'],
  ['中華飯店 泰林', '泰林', 'こちらが長い'],
  ['くいもの市場 夢島（むとう）', 'むとう', 'カッコ内が食べログの名前'],
  ['道の駅かでな展望カフェ', '道の駅かでな', '施設名＋業態'],
  ['鶏白湯らーめん鶏寅', '鶏寅', 'ジャンル語が前置'],
  ['MKCAFE（瀬長島ウミカジテラス）', 'MK CAFE 沖縄ウミカジテラス店', '施設名の表記差'],
  ['土〜夢 ごはんカフェ 西崎店', '土～夢 ごはんカフェ 西崎店', '波ダッシュの字違い']
];

let pass = 0, fail = 0;
console.log('=== 通ってほしい組 (>= ' + BAR + ') ===');
should.forEach(([a, b, note]) => {
  const d = dice(a, b), ok = d >= BAR;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${d.toFixed(2)}  ${note}: 「${a}」/「${b}」`);
  ok ? pass++ : fail++;
});

console.log('\n=== 通ってはいけない組 (< ' + BAR + ') ===');
shouldNot.forEach(([a, b, note]) => {
  const d = dice(a, b), ok = d < BAR;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${d.toFixed(2)}  ${note}: 「${a}」/「${b}」`);
  ok ? pass++ : fail++;
});

console.log('\n=== 実データの対応組 (>= ' + BAR + ') ===');
realPairs.forEach(([a, b, note]) => {
  const d = dice(a, b), ok = d >= BAR;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${d.toFixed(2)}  ${note}: 「${a}」/「${b}」`);
  ok ? pass++ : fail++;
});

console.log('\n=== 支店名の切り出し ===');
[['ズートンズ 久茂地店', 'ズートンズ', '久茂地'],
 ['富士家 泊本店', '富士家', '泊'],
 ['浜屋そば', '浜屋そば', ''],
 ['沖縄そば専門店', '沖縄そば専門店', '']].forEach(([s, core, branch]) => {
  const r = splitBranch(s);
  const ok = r.core === core && r.branch === branch;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  「${s}」→ core:「${r.core}」branch:「${r.branch}」`);
  ok ? pass++ : fail++;
});

console.log('\n=== 同点は曖昧として捨てる ===');
// 同じブランドの別店舗が同点で並ぶ場合、どちらか一方に決め打ちしてはいけない
const ambCases = [
  {name: 'OKINAWA SOBA EIBUN', pool: ['STAND EIBUN', 'OKINAWA SOBA EIBUN'], want: 'OKINAWA SOBA EIBUN', note: '完全一致がある側を選ぶ'},
  {name: 'まるち', pool: ['沖縄そば専門店 まるち 北谷店', '沖縄そば専門店 まるち 南城市つきしろ店'],
   want: null, note: '同ブランドの2支店に同点で当たるので捨てる'},
  {name: '旬菜処 びいどろ', pool: ['旬菜処 びいどろ', 'カフェ くるくま'], want: '旬菜処 びいどろ', note: '一意に決まる'}
];
ambCases.forEach(({name, pool, want, note}) => {
  const r = bestMatch(name, pool, x => x);
  const ok = r.match === want;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  「${name}」→ ${r.match === null ? `なし(${r.ambiguous ? '同点' : '一致度不足'})` : `「${r.match}」`} ${note}`);
  ok ? pass++ : fail++;
});

console.log('\n=== 距離 ===');
[[metres(26.2124, 127.6809, 26.2124, 127.6809), 0, '同一点'],
 [metres(26.2124, 127.6809, 26.2224, 127.6809), 1112, '緯度0.01度']].forEach(([got, want, note]) => {
  const ok = Math.abs(got - want) <= 30;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${note} = ${got}m (${want}m を期待)`);
  ok ? pass++ : fail++;
});

console.log(`\n合計: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
