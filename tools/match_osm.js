// 候補名と OSM POI 名を突き合わせ、GSIで番地が取れなかった店の座標候補を出す
const cands = require('./cand_batch1.js');
const geo = require('./geo_batch1.json');
const pois = [...require('./osm_yanbaru.json'), ...require('./osm_nakagusuku.json')];
const squash = s => (s||'').toLowerCase().replace(/[\s　・･'’\-ー～~。、（）()]/g,'');
for (let i = 0; i < cands.length; i++) {
  if (geo[i].banchi) continue;
  const name = cands[i][1], key = squash(name);
  const hits = pois.filter(p => {
    const pn = squash(p.name), pe = squash(p.en);
    // 短い側が長い側に含まれる（4文字以上のときだけ）
    const cmp = (a,b) => a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a));
    return cmp(key, pn) || cmp(key, pe);
  });
  console.log((hits.length ? '' : 'MISS ') + name + ' [' + cands[i][3] + ']');
  hits.forEach(p => console.log('      -> ' + p.lat.toFixed(6) + ',' + p.lng.toFixed(6) + ' | ' + p.kind + ' | ' + p.name + (p.en ? ' / ' + p.en : '')));
}
