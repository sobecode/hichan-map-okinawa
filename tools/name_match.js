/*
 * 店名の照合。食べログ/Googleが持つ正式名と、こちらの配列の名前を突き合わせる。
 * fetch_ratings.js（Google Places）と apply_tabelog.js（食べログ）で共用する。
 *
 * 素の2-gram Dice だけだと「浜屋そば」と「そば・てびち専門店 浜屋」が 0.33 しか出ず落ちる一方、
 * 固有部分の共有を無条件に信じると「O's House」と「THE TACORICE HOUSE」が house だけで通る。
 * そのため (a) ジャンル語・一般英単語を除外し (b) 支店名の扱いを分け (c) 共通部分の長さで条件を変える。
 */
'use strict';

function squash(s) {
  return String(s)
    .replace(/[\s　・,，.。'"’”`\-−ー–—/／&＆!！?？]/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .toLowerCase();
}
// 読みカッコを落とす版と、中身を残す版。「琉冰 Ryu-pin（おんなの駅）」のような表記差を両面から見る
function norm(s) { return squash(String(s).replace(/[（(][^）)]*[）)]/g, '')); }
function normKeep(s) { return squash(String(s).replace(/[（()）]/g, '')); }

// 一致しても店の同一性を示さない語。固有部分の判定から除く
const GENERIC = new Set([
  // ジャンル・業態(日本語)
  'そば', 'すば', '食堂', 'カフェ', '珈琲', 'ラーメン', 'らーめん', '麺', '専門店', '本店', '支店',
  '新館', '別邸', '沖縄', '琉球', '料理', 'キッチン', 'ダイニング', '商店', '酒場', '居酒屋',
  '焼肉', '焼鳥', '焼き鳥', '製麺', 'パン', 'ベーカリー', 'レストラン', '中華', '海鮮', '食事処',
  '茶屋', '茶房', '売店', 'パーラー', 'すし', '寿司', '鮮魚店', 'カレー', '弁当', 'テラス',
  'ホテル', 'ステーキ', 'ハンバーガー', 'ぜんざい', '大衆', '酒造', '市場',
  // ジャンル・業態(英語)。O's House と TACORICE HOUSE が house だけで一致するのを防ぐ
  'cafe', 'coffee', 'house', 'bowl', 'grill', 'garden', 'market', 'shop', 'store', 'table',
  'kitchen', 'dining', 'diner', 'food', 'foods', 'burger', 'steak', 'pizza', 'curry', 'noodle',
  'noodles', 'ramen', 'soba', 'sushi', 'bakery', 'bread', 'beach', 'island', 'blue', 'sea',
  'okinawa', 'bar', 'restaurant', 'roastery', 'works', 'stand', 'sweets', 'okinawan', 'the',
  // 地名・施設名。共有していても同じ店の証拠にならない。
  // 「HAMMOCK CAFE LA ISLA（瀬長島）」が「サンルーム スイーツ 瀬長島」に一致したのを防ぐ
  'オキナワ', '瀬長島', '瀬長', 'ウミカジテラス', 'おんなの駅', 'なかゆくい', '道の駅', '国際通り',
  'デポアイランド', '星野リゾート', '星のや', '万座毛', '読谷', '北谷', '那覇', '名護', '恩納',
  '糸満', '南城', '豊見城', '浦添', '宜野湾', '嘉手納', '首里', '久茂地', '牧港', '港川', '美浜',
  '泡瀬', '普天間', '本部', '今帰仁', 'あしびなー', 'イーアス', 'shuri', 'ブルー',
  'ハウス', 'リゾート', 'ビーチ', 'ホテル', 'ドライブイン', 'バーガー', 'タコライス', 'タコス'
]);

// 末尾の支店表記を切り出す。「ズートンズ 久茂地店」→ core:ズートンズ / branch:久茂地
function splitBranch(s) {
  const m = /^(.*?)([^\s　]{1,7}?)(本店|支店|店)$/.exec(String(s).trim());
  if (!m || !m[1].trim()) return {core: String(s), branch: ''};
  return {core: m[1].trim(), branch: squash(m[2])};
}

function diceRaw(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // 包含は「短い側が長い側の半分以上」を条件にする。無条件だと
  // 「onde」が「EL RINCON DE MEXICOLA」(=elrincondemexicola)に含まれて一致してしまう
  if ((a.includes(b) || b.includes(a)) &&
      Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.5) return 0.95;
  const grams = s => { const g = []; for (let i = 0; i + 1 < s.length; i++) g.push(s.slice(i, i + 2)); return g; };
  const A = grams(a), B = grams(b);
  if (!A.length || !B.length) return 0;
  const pool = B.slice();
  let hit = 0;
  for (const g of A) { const i = pool.indexOf(g); if (i >= 0) { pool.splice(i, 1); hit++; } }
  return (2 * hit) / (A.length + B.length);
}

// 除外語も squash を通しておく。squash は長音符を落とすので、通さないと
// 「ブルー」→「ブル」/「らーめん」→「らめん」になった語を除外できない。
// 長いものから消して「沖縄そば」が「沖縄」+「そば」で消えるようにする
const GENERIC_SORTED = [...new Set([...GENERIC].map(squash))]
  .filter(Boolean).sort((a, b) => b.length - a.length);
function stripGeneric(t) {
  let out = t;
  for (const g of GENERIC_SORTED) if (out.includes(g)) out = out.split(g).join('');
  return out;
}

// 空白・中黒・カッコで区切り、ジャンル語を落として残った「固有の語」を返す。
// 英字だけの語は4文字以上を要求する — de / la / os のような繋ぎ語で
// 「EL RINCON DE MEXICOLA」が「Maison de Fujii」に一致してしまうため。
// 漢字・かなは2文字でも意味を持つ(浜屋・琉冰)ので2文字から通す。
function tokens(s) {
  return String(s).replace(/[（()）]/g, ' ').split(/[\s　・,，/／]+/)
    .map(t => stripGeneric(squash(t)))
    .filter(t => /^[\x20-\x7E]+$/.test(t) ? t.length >= 4 : t.length >= 2);
}

// 固有の語を共有しているか。部分文字列ではなく語単位で見るのが要点で、
// これがないと「osteria due」と「JUMBO STEAK HAN'S」が oste を挟んで一致してしまう
function shareToken(ours, theirs) {
  const A = tokens(splitBranch(ours).core), B = tokens(splitBranch(theirs).core);
  for (const a of A) {
    for (const b of B) {
      if (a === b) return true;
      const [short, long] = a.length <= b.length ? [a, b] : [b, a];
      // 「チャイニーズ琉華菜苑」に「琉華菜苑」が入る程度(0.4)は同じ店とみなす。
      // 地名・ジャンル語は既に除いてあるので、この緩さで誤りは出にくい
      if (long.includes(short) && short.length / long.length >= 0.35) return true;
    }
  }
  return false;
}

/** 0〜1 の一致度。0.6以上を「同じ店」の目安に使う */
function dice(ours, theirs) {
  const raw = Math.max(diceRaw(norm(ours), norm(theirs)), diceRaw(normKeep(ours), normKeep(theirs)));

  // 支店名が両方にあって食い違うなら別店舗。「富士家 泊本店」と「富士家 国際通り店」を混ぜない
  const bo = splitBranch(ours), bt = splitBranch(theirs);
  if (bo.branch && bt.branch && bo.branch !== bt.branch) return Math.min(raw, 0.5);

  // 正式名が長いだけの同一店(「浜屋そば」と「そば・てびち専門店 浜屋」)を拾う
  return shareToken(ours, theirs) ? Math.max(raw, 0.75) : raw;
}

function metres(aLat, aLng, bLat, bLng) {
  const R = 6371000, rad = d => d * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

/** 候補の中から最も一致する1件を返す。同点が並ぶときは曖昧として null を返す */
function bestMatch(name, candidates, getName) {
  const scored = candidates.map(c => ({c, sim: dice(getName(c), name)}))
                           .sort((x, y) => y.sim - x.sim);
  if (!scored.length || scored[0].sim < 0.6) return {match: null, sim: scored.length ? scored[0].sim : 0, ambiguous: false};
  if (scored[1] && scored[1].sim >= scored[0].sim - 0.001) {
    return {match: null, sim: scored[0].sim, ambiguous: true, tied: [scored[0].c, scored[1].c]};
  }
  return {match: scored[0].c, sim: scored[0].sim, ambiguous: false};
}

module.exports = {squash, norm, normKeep, GENERIC, splitBranch, diceRaw, tokens, shareToken, dice, metres, bestMatch};
