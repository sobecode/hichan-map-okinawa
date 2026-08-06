// マピオンの電話帳ジャンル一覧を市町村ぶん走査し、店名で当てて緯度経度を取る
//   node tools/mapion_phone.js 47308 島豚家
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) hichan-map-okinawa/1.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async url => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(r.status + ' ' + url); return r.text(); };
const squash = s => (s || '').toLowerCase().replace(/[\s　・･'’\-ー～~。、（）()]/g, '');

// M02046 パン屋・ベーカリー / M51006 飲食店 / M01028 定食・食堂 / M01027 郷土料理 / M01012 カフェ
const GENRES = ['M02046', 'M51006', 'M01028', 'M01027', 'M01012', 'M01013', 'M01011', 'M01001', 'M01006', 'M01005'];

(async () => {
  const [code, name] = process.argv.slice(2);
  const key = squash(name);
  for (const g of GENRES) {
    for (let page = 1; page <= 5; page++) {
      const url = 'https://www.mapion.co.jp/phonebook/' + g + '/' + code + '/' + (page > 1 ? 'p' + page + '/' : '');
      let html;
      try { html = await get(url); } catch (e) { break; }
      const rows = [...html.matchAll(new RegExp('href="(/phonebook/' + g + '/' + code + '/[^"/]+/)"[^>]*>([^<]+)<', 'g'))]
        .map(m => ({ href: m[1], text: m[2].trim() }));
      if (!rows.length) break;
      const hit = rows.find(r => squash(r.text) === key)
               || rows.find(r => squash(r.text).includes(key) || key.includes(squash(r.text)));
      if (hit) {
        await sleep(600);
        const d = await get('https://www.mapion.co.jp' + hit.href);
        const m = d.match(/\/m2\/[\d.]+\/(-?\d+\.\d+)\/(-?\d+\.\d+)\//);
        const addr = (d.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
        console.log(JSON.stringify({ genre: g, name: hit.text, lat: m && +m[1], lng: m && +m[2], title: addr.slice(0, 70), url: 'https://www.mapion.co.jp' + hit.href }, null, 1));
        return;
      }
      await sleep(600);
    }
  }
  console.log('見つからず: ' + name + ' (' + code + ')');
})();
