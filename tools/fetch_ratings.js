/*
 * Googleマップの☆評価とレビュー件数を Places API (New) の Text Search で取得する。
 *
 *   node tools/fetch_ratings.js --limit 5     # まず5件だけで動作確認
 *   node tools/fetch_ratings.js               # 全件(747回。無料枠は月1,000回)
 *
 * APIキーは環境変数 PLACES_API_KEY、または ../.places_api_key（リポジトリ外）から読む。
 * 取得結果は tools/ratings.json に書き出すだけで index.html は書き換えない。
 * 反映は apply_ratings.js が担当する。
 *
 * 課金上の注意: rating / userRatingCount は Text Search "Enterprise" SKU を発火させる。
 * 無料枠は月1,000回なので、リトライを含めて1,000回を超えないよう回数を数えている。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const OUT = path.join(__dirname, 'ratings.json');
const CALL_BUDGET = 950; // 無料枠1,000回に対する安全マージン

function readKey() {
  if (process.env.PLACES_API_KEY) return process.env.PLACES_API_KEY.trim();
  for (const p of [path.join(ROOT, '..', '.places_api_key'), path.join(ROOT, '..', '.hichan_places_key.txt')]) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  }
  console.error('APIキーが見つかりません。環境変数 PLACES_API_KEY を設定するか、');
  console.error('C:\\Users\\kinta\\.places_api_key にキーだけを書いたファイルを置いてください。');
  process.exit(1);
}

function loadShops() {
  const h = fs.readFileSync(INDEX, 'utf8');
  return eval(h.match(/const shops\s*=\s*(\[[\s\S]*?\]);/)[1]);
}

// 記号と全角英数を潰す。読みカッコは落とす版(norm)と中身を残す版(normKeep)を用意し、
// 「琉冰 Ryu-pin（おんなの駅）」対「琉冰 おんなの駅店」のような表記差を両方から拾う
function squash(s) {
  return String(s)
    .replace(/[\s　・,，.。'"’”`\-−ー–—/／&＆]/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .toLowerCase();
}
function norm(s) { return squash(String(s).replace(/[（(][^）)]*[）)]/g, '')); }
function normKeep(s) { return squash(String(s).replace(/[（()）]/g, '')); }

// ジャンル名など、一致しても店の同一性を示さない語。固有部分の判定から除く
const GENERIC = new Set([
  'そば', 'すば', '食堂', 'カフェ', 'cafe', 'coffee', '珈琲', 'ラーメン', 'らーめん', '麺',
  '専門店', '本店', '支店', '新館', '沖縄', 'okinawa', '琉球', '料理', 'キッチン', 'kitchen',
  'ダイニング', 'dining', '商店', '酒場', '居酒屋', '焼肉', '焼鳥', '製麺', 'パン', 'bakery',
  'ベーカリー', 'レストラン', 'restaurant', '中華', '海鮮', '食事処', '茶屋', '売店', 'パーラー',
  'すし', '寿司', '鮮魚店', 'カレー', 'bar', 'ばー', '弁当', 'テラス', 'ホテル', 'hotel'
]);

// 2-gram の Dice 係数
function diceRaw(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.95;
  const grams = s => { const g = []; for (let i = 0; i + 1 < s.length; i++) g.push(s.slice(i, i + 2)); return g; };
  const A = grams(a), B = grams(b);
  if (!A.length || !B.length) return 0;
  const pool = B.slice();
  let hit = 0;
  for (const g of A) { const i = pool.indexOf(g); if (i >= 0) { pool.splice(i, 1); hit++; } }
  return (2 * hit) / (A.length + B.length);
}

// 最長共通部分文字列
function lcs(a, b) {
  let best = '';
  for (let i = 0; i < a.length; i++) {
    for (let j = i + best.length + 1; j <= a.length; j++) {
      const sub = a.slice(i, j);
      if (!b.includes(sub)) break;
      if (sub.length > best.length) best = sub;
    }
  }
  return best;
}

// 名前の一致度。Googleの正式名は「そば・てびち専門店 浜屋」のように長いことが多いので、
// 素の Dice だけでなく、ジャンル語を除いた固有部分の共有も見る
function dice(ours, theirs) {
  let s = Math.max(diceRaw(norm(ours), norm(theirs)), diceRaw(normKeep(ours), normKeep(theirs)));
  const a = normKeep(ours), b = normKeep(theirs);
  const common = lcs(a, b);
  if (common.length >= 2 && !GENERIC.has(common) &&
      common.length / Math.min(a.length, b.length) >= 0.35) {
    s = Math.max(s, 0.75);
  }
  return s;
}

function metres(aLat, aLng, bLat, bLng) {
  const R = 6371000, rad = d => d * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

const FIELD_MASK = [
  'places.displayName', 'places.rating', 'places.userRatingCount',
  'places.location', 'places.formattedAddress', 'places.businessStatus'
].join(',');

async function search(key, shop) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': FIELD_MASK
    },
    body: JSON.stringify({
      textQuery: `${shop.n} ${String(shop.a).replace(/\//g, ' ')} 沖縄県`,
      languageCode: 'ja',
      regionCode: 'JP',
      maxResultCount: 3,
      // 保存済み座標の周辺に寄せる。同名チェーンの他県店を拾わないための保険
      locationBias: {circle: {center: {latitude: shop.lat, longitude: shop.lng}, radius: 3000}}
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

(async () => {
  const key = readKey();
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
  const shops = loadShops();
  const targets = shops.slice(0, Math.min(limit, shops.length));

  if (targets.length > CALL_BUDGET) {
    console.error(`対象 ${targets.length} 件が安全上限 ${CALL_BUDGET} 回を超えています。--limit で分割してください。`);
    process.exit(1);
  }
  console.log(`対象 ${targets.length} 件 / 全 ${shops.length} 件。API呼び出しは1件1回。\n`);

  const results = [];
  let calls = 0, ok = 0, weak = 0, none = 0;

  for (let i = 0; i < targets.length; i++) {
    const s = targets[i];
    const row = {n: s.n, a: s.a, area_id: s.area_id, lat: s.lat, lng: s.lng};
    try {
      calls++;
      const data = await search(key, s);
      const cands = (data.places || []).map(p => {
        const lat = p.location && p.location.latitude, lng = p.location && p.location.longitude;
        const name = (p.displayName && p.displayName.text) || '';
        return {
          name, rating: p.rating, count: p.userRatingCount,
          status: p.businessStatus, addr: p.formattedAddress,
          sim: dice(s.n, name),
          dist: (lat != null && lng != null) ? metres(s.lat, s.lng, lat, lng) : null
        };
      });
      // 名前の近さを優先し、同程度なら近い方を採る
      cands.sort((x, y) => (y.sim - x.sim) || ((x.dist ?? 9e9) - (y.dist ?? 9e9)));
      const best = cands[0];

      if (!best) { row.verdict = 'なし'; none++; }
      else {
        Object.assign(row, {
          matched: best.name, rating: best.rating, count: best.count,
          dist: best.dist, sim: Number(best.sim.toFixed(2)),
          bizStatus: best.status, addr: best.addr
        });
        const d = best.dist;
        if (best.rating == null) { row.verdict = '評価なし'; none++; }
        // 名前がしっかり一致 or 座標がほぼ同じ+名前もそこそこ一致なら採用。
        // 同一建物に複数店が入るケース(ウミカジテラス等)があるので距離だけでは決めない
        else if (d != null && ((best.sim >= 0.6 && d <= 1500) || (best.sim >= 0.4 && d <= 300))) {
          row.verdict = 'OK'; ok++;
        } else { row.verdict = '要確認'; weak++; }
      }
    } catch (e) {
      row.verdict = 'エラー';
      row.error = String(e.message).slice(0, 200);
      none++;
    }
    results.push(row);
    if ((i + 1) % 25 === 0 || i === targets.length - 1) {
      process.stdout.write(`\r  ${i + 1}/${targets.length}  OK:${ok} 要確認:${weak} 取得不可:${none}   `);
    }
    await new Promise(r => setTimeout(r, 120));
  }

  fs.writeFileSync(OUT, JSON.stringify(results, null, 1), 'utf8');
  console.log(`\n\nAPI呼び出し ${calls} 回。${OUT} に書き出しました。`);
  console.log(`OK ${ok} / 要確認 ${weak} / 取得不可 ${none}`);
  const bad = results.filter(r => r.verdict === '要確認');
  if (bad.length) {
    console.log('\n--- 要確認(名前の一致 0.6未満 または 1.5km超) ---');
    bad.slice(0, 40).forEach(r =>
      console.log(`  ${r.n} 〔${r.a}〕 → 「${r.matched}」 ★${r.rating} 一致${r.sim} ${r.dist}m`));
    if (bad.length > 40) console.log(`  ...他 ${bad.length - 40} 件`);
  }
})();
