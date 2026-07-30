/*
 * 配列そのものの整合性点検。ネットワーク不要。
 *   node tools/audit_data.js
 *
 * 見るもの:
 *  1. 名前にHTML実体参照や生タグが混ざっていないか(ポップアップのGoogleマップURLが壊れる)
 *  2. tags/badges の span が閉じているか、CSSに存在しないクラスを使っていないか
 *  3. 重複した店名
 *  4. 必須フィールドの空・型
 *  5. 座標が沖縄の範囲внутри にあるか
 *  6. 説明文の体裁(前後の空白、句点なし、極端に短い/長い)
 *  7. 営業時間 h とジャンル既定の食事時間が食い違う店(昼夜バッジの精度)
 *  8. ジャンルとタグの不一致
 */
'use strict';
const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX, 'utf8');
const shops = eval(html.match(/const shops\s*=\s*(\[[\s\S]*?\]);/)[1]);

const problems = {};
const add = (k, msg) => (problems[k] || (problems[k] = [])).push(msg);

// --- 1. 名前の実体参照・生タグ
// ポップアップは encodeURIComponent(s.n + ' ' + s.a + ' 沖縄県') でGoogleマップを検索する。
// 名前に &amp; が入っていると "&amp;" という文字列がそのまま検索語になる
shops.forEach(s => {
  if (/&(amp|lt|gt|quot|#\d+);/.test(s.n)) {
    const fixed = s.n.replace(/&amp;/g, '&');
    add('name-entity', `${s.n} → Googleマップ検索語が壊れる（「${fixed}」が正しい）`);
  }
  if (/<[^>]+>/.test(s.n)) add('name-html', s.n);
  if (s.n !== s.n.trim()) add('name-space', `「${s.n}」前後に空白`);
});

// --- 2. tags/badges のHTML
const cssClasses = new Set([...html.matchAll(/\.(tag-[a-z]+|hot-badge|new-badge|sns-badge)\b/g)].map(m => m[1]));
shops.forEach(s => {
  ['tags', 'badges'].forEach(f => {
    const v = s[f] || '';
    const open = (v.match(/<span/g) || []).length, close = (v.match(/<\/span>/g) || []).length;
    if (open !== close) add('span-unbalanced', `${s.n} の ${f}: <span>${open} 対 </span>${close}`);
    [...v.matchAll(/class="([^"]+)"/g)].forEach(m => {
      m[1].split(/\s+/).filter(Boolean).forEach(c => {
        if (c === 'tag') return;
        if (!cssClasses.has(c)) add('css-missing', `${s.n}: クラス「${c}」がCSSに無い`);
      });
    });
  });
});

// --- 3. 重複店名
const byName = {};
shops.forEach(s => (byName[s.n] || (byName[s.n] = [])).push(s));
Object.entries(byName).filter(([, v]) => v.length > 1)
  .forEach(([n, v]) => add('dup-name', `${n} × ${v.length}（${v.map(s => s.a).join(' / ')}）`));

// --- 4. 必須フィールド
const REQ = ['n', 'g', 'a', 'area_id', 'lat', 'lng', 'd', 'r', 'h', 'tags', 'badges'];
shops.forEach(s => {
  REQ.forEach(f => { if (!(f in s)) add('field-missing', `${s.n}: ${f} が無い`); });
  if (typeof s.lat !== 'number' || typeof s.lng !== 'number') add('coord-type', s.n);
  if (!String(s.d || '').trim()) add('empty-d', s.n);
  if (!String(s.r || '').trim()) add('empty-r', s.n);
  if (!String(s.tags || '').trim()) add('empty-tags', s.n);
});

// --- 5. 座標の範囲(沖縄本島と周辺離島)
shops.forEach(s => {
  if (!(s.lat > 26.0 && s.lat < 26.95 && s.lng > 127.5 && s.lng < 128.4)) {
    add('coord-range', `${s.n} 〔${s.a}〕 ${s.lat}, ${s.lng}`);
  }
});

// --- 6. 説明文の体裁
shops.forEach(s => {
  const d = String(s.d || '');
  if (d !== d.trim()) add('d-space', s.n);
  if (d && !/[。！?？]$/.test(d.trim())) add('d-no-period', `${s.n}: 「${d.slice(-16)}」`);
  if (d.length < 20) add('d-short', `${d.length}字 ${s.n} 〔${s.a}〕「${d}」`);
  if (d.length > 90) add('d-long', `${d.length}字 ${s.n}`);
  if (/\s{2,}/.test(d)) add('d-double-space', s.n);
});

/*
 * 検討して「欠陥ではない」と結論した2件。同じ点検を繰り返さないため理由を残す。
 *
 * (a) h とジャンル既定の食事時間の食い違い: getMealType() は
 *     guessMealFromHours(s.h) || GENRE_MEAL_DEFAULT[s.g] なので、h があれば必ず h が勝つ。
 *     食い違い45件は「既定を正しく上書きしている」状態で、直すものではない。
 *
 * (b) ジャンルとタグの不一致: tag-* はジャンル分類ではなく配色用のパレットで、
 *     CSSにあるのは cafe/dinner/local/lunch/new/sns/soba/steak/sweets/view の10種だけ。
 *     tag-bakery や tag-ramen は存在しないので、パン屋が tag-cafe を使うのは意図どおり。
 */

// --- 7. 昼夜バッジが h ではなくジャンル既定に頼っている店(参考情報)
const GENRE_MEAL = eval('(' + /const GENRE_MEAL_DEFAULT = (\{[\s\S]*?\});/.exec(html)[1] + ')');
const noHours = shops.filter(s => !s.h);

// --- 出力
const LABEL = {
  'name-entity': '店名にHTML実体参照（Googleマップリンクが壊れる）',
  'name-html': '店名に生タグ', 'name-space': '店名の前後に空白',
  'span-unbalanced': 'span が閉じていない', 'css-missing': 'CSSに無いクラス',
  'dup-name': '同じ店名が複数', 'field-missing': 'フィールド欠落', 'coord-type': '座標が数値でない',
  'empty-d': '説明が空', 'empty-r': 'おすすめが空', 'empty-tags': 'タグが空',
  'coord-range': '座標が沖縄の範囲外', 'd-space': '説明の前後に空白',
  'd-no-period': '説明が句点で終わっていない', 'd-short': '説明が20字未満',
  'd-long': '説明が90字超', 'd-double-space': '説明に連続空白'
};
const order = Object.keys(LABEL).filter(k => problems[k]);
console.log(`全 ${shops.length} 店を点検。指摘 ${order.length} 種類\n`);
order.forEach(k => {
  const v = problems[k];
  console.log(`■ ${LABEL[k]}: ${v.length} 件`);
  v.slice(0, 30).forEach(m => console.log('   ' + m));
  if (v.length > 30) console.log(`   ...他 ${v.length - 30} 件`);
  console.log('');
});
if (!order.length) console.log('指摘なし。');

// 参考情報(欠陥ではない)
const byGenreNoH = {};
noHours.forEach(s => byGenreNoH[s.g] = (byGenreNoH[s.g] || 0) + 1);
console.log(`― 参考 ― 営業時間 h が無く、昼夜バッジがジャンル既定に頼っている店: ${noHours.length} / ${shops.length}`);
console.log('   ' + Object.entries(byGenreNoH).sort((a, b) => b[1] - a[1])
  .map(([g, n]) => `${g}${n}(既定${GENRE_MEAL[g]})`).join(' '));
