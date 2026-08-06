// 未解決分をまとめてマピオンの番地ページから引く
const fs = require('fs');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) hichan-map-okinawa/1.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async url => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(r.status); return r.text(); };
const squash = s => s.replace(/[\s　字大字]/g, '');

const TARGETS = [
  // 店名, 市町村コード, 字, 番地(枝番なし)
  ['島豚家',                     47308, '豊原',       479],
  ['マーブルー',                 47308, '新里',       247],
  ['レモン食堂',                 47311, '真栄田',     190],
  ['マエダ ブリーズ',            47311, '真栄田',     1430],
  ['パレット',                   47311, '瀬良垣',     2486],
  ['sea Heart',                  47311, '山田',       1220],
  ['パンの耳',                   47311, '谷茶',       52],
  ['中華ラーメン醤',             47324, '都屋',       275],
  ['ベーカリー＆カフェ ポッド',  47324, '伊良皆',     253],
  ['牛骨琉球ラーメン マルマロ 北谷店', 47326, '美浜',  34],
  ['悠心',                       47362, '東風平',     476],
  ['マジョパン',                 47362, '宜次',       578],
  ['te',                         47362, '具志頭',     59],
  ['鶴味家',                     47314, '屋嘉',       2903],
  ['麺処 千代',                  47314, '金武',       10454],
  ['古宇利島ジャックマニー',     47306, '古宇利',     348],
  ['Les Traces de MA',           47212, '根差部',     172],
  ['おおきな木',                 47215, '大里大城',   1920],
  ['パンとケーキの店 Rikara',    47313, '惣慶',       1829],
  ['みらいパン',                 47313, '漢那',       1633],
];

const azaCache = {};
async function azaIndex(code) {
  if (!azaCache[code]) {
    const html = await get('https://www.mapion.co.jp/address/' + code + '/');
    azaCache[code] = [...html.matchAll(new RegExp('href="(/address/' + code + '/\\d+/)"[^>]*>([^<]+)<', 'g'))]
      .map(m => ({ href: m[1], text: m[2].trim() }));
    await sleep(700);
  }
  return azaCache[code];
}

(async () => {
  const ok = [], ng = [];
  for (const [name, code, aza, banchi] of TARGETS) {
    try {
      const list = await azaIndex(code);
      const want = squash(aza);
      const hit = list.find(a => squash(a.text) === want) || list.find(a => squash(a.text).includes(want));
      if (!hit) { ng.push([name, '字なし: ' + list.map(a => a.text).join(',')]); continue; }
      const page = await get('https://www.mapion.co.jp' + hit.href);
      await sleep(700);
      const banchis = [...page.matchAll(new RegExp('href="(' + hit.href.replace(/\/$/, '') + '::\\d+/)"[^>]*>([^<]+)<', 'g'))]
        .map(m => ({ href: m[1], text: m[2].trim() }));
      const b = banchis.find(x => x.text === String(banchi));
      if (!b) { ng.push([name, '番地' + banchi + 'なし (一覧' + banchis.length + '件)']); continue; }
      const dpage = await get('https://www.mapion.co.jp' + b.href);
      await sleep(700);
      const m = dpage.match(/\/m2\/[\d.]+\/(-?\d+\.\d+)\/(-?\d+\.\d+)\//);
      const shown = (dpage.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
      if (!m) { ng.push([name, '座標リンクなし']); continue; }
      ok.push({ name, lat: +m[1], lng: +m[2], shown: shown.slice(0, 50), url: 'https://www.mapion.co.jp' + b.href });
      console.log('OK   ' + name + '  ' + m[1] + ',' + m[2] + '   ← ' + shown.slice(0, 40));
    } catch (e) { ng.push([name, String(e).slice(0, 60)]); }
  }
  console.log('\n--- 未解決 ---');
  ng.forEach(x => console.log('NG   ' + x[0] + '  :  ' + x[1].slice(0, 200)));
  fs.writeFileSync(__dirname + '/_mapion.json', JSON.stringify(ok, null, 1));
  console.log('\n解決 ' + ok.length + ' / ' + TARGETS.length);
})();
