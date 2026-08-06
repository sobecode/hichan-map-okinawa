// マピオンの住所ページから番地の緯度経度を引く
//   node tools/mapion_lookup.js 47308 豊原 479
// 市町村コードの字一覧 → 該当する字の番地一覧 → 番地ページの「大きい地図を見る」(/m2/15.00/{lat}/{lng}/)
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) hichan-map-okinawa/1.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async url => {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(res.status + ' ' + url);
  return await res.text();
};
// <a href="/address/47308/12/">字豊原</a> のような組を全部拾う
const links = (html, base) => {
  const out = [];
  const re = new RegExp('href="(' + base + '[^"]*?)"[^>]*>([^<]+)<', 'g');
  let m;
  while ((m = re.exec(html))) out.push({ href: m[1], text: m[2].trim() });
  return out;
};
const squash = s => s.replace(/[\s　字大字]/g, '');

async function lookup(code, aza, banchi) {
  const top = await get('https://www.mapion.co.jp/address/' + code + '/');
  const azas = links(top, '/address/' + code + '/');
  const want = squash(aza);
  const hit = azas.find(a => squash(a.text) === want) || azas.find(a => squash(a.text).includes(want));
  if (!hit) return { err: '字が見つからない', 候補: azas.map(a => a.text).slice(0, 40) };
  await sleep(600);

  // 番地一覧はページ分割されることがあるので、番地ページのリンクを全部集める
  let list = [];
  for (let page = 1; page <= 6; page++) {
    const url = 'https://www.mapion.co.jp' + hit.href + (page > 1 ? 'p' + page + '/' : '');
    let html;
    try { html = await get(url); } catch (e) { break; }
    const got = links(html, hit.href.replace(/\/$/, '') + '::');
    list = list.concat(got);
    if (!/p\d+\/">/.test(html) || got.length === 0) break;
    await sleep(600);
  }
  const target = String(banchi);
  const b = list.find(x => x.text.replace(/[^0-9-]/g, '') === target)
         || list.find(x => x.text.includes(target));
  if (!b) return { err: '番地が一覧にない', aza: hit.text, 近い番地: list.map(x => x.text).slice(0, 30) };
  await sleep(600);

  const page = await get('https://www.mapion.co.jp' + b.href);
  const m = page.match(/\/m2\/[\d.]+\/(-?\d+\.\d+)\/(-?\d+\.\d+)\//);
  const shown = (page.match(/<h1[^>]*>([^<]+)<\/h1>/) || [])[1];
  if (!m) return { err: '座標リンクが無い', aza: hit.text, banchi: b.text, url: b.href };
  return { aza: hit.text, banchi: b.text, 表示住所: shown, lat: +m[1], lng: +m[2], url: 'https://www.mapion.co.jp' + b.href };
}

(async () => {
  const [code, aza, banchi] = process.argv.slice(2);
  console.log(JSON.stringify(await lookup(code, aza, banchi), null, 1));
})();
