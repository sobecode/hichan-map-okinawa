// 逆ジオコーダで字が食い違った19店について、調べた実住所をGSIに掛け、
// 現在の座標との距離を測って「aの表記が違うだけ」か「座標がずれている」かを判定する
const fs=require('fs');
const T=[
 ['THE GARLIC SHRIMP','沖縄県国頭郡恩納村安冨祖1355-2'],
 ['ぱん工房おとなりや','沖縄県中頭郡読谷村瀬名波633-2'],
 ['麺屋シロサキ','沖縄県中頭郡読谷村長浜1720-1'],
 ['居酒屋はりゆん','沖縄県中頭郡読谷村大木467-3'],
 ['麺屋あぐり','沖縄県中頭郡読谷村波平1817-5'],
 ['焼肉きんぐ北谷店','沖縄県中頭郡北谷町伊平2-3-5'],
 ['しゃぶしゃぶ温野菜 北谷店','沖縄県中頭郡北谷町伊平238'],
 ['Thaicoon（タイクーン）','沖縄県中頭郡北谷町港10-18'],
 ['みよ家','沖縄県中頭郡嘉手納町嘉手納463-13'],
 ['北海道ラーメン追風丸 大謝名店','沖縄県宜野湾市真志喜5-2-6'],
 ['坦々ヌードル専門店 来久琉','沖縄県浦添市伊祖2-24-5'],
 ['Ryukyu Ramen Apollo','沖縄県浦添市港川1-5-11'],
 ['JUMBO STEAK HAN’S 本店','沖縄県那覇市久茂地3-27-10'],
 ['GAJUMARU CAFE','沖縄県沖縄市上地2-9-3'],
 ['さかな屋','沖縄県沖縄市美里仲原町29-12'],
 ['優美堂','沖縄県糸満市伊原372-2'],
 ['琉球ゴルフ倶楽部 レストラン','沖縄県南城市玉城親慶原1'],
];
const shops=eval(fs.readFileSync('index.html','utf8').match(/const shops\s*=\s*(\[[\s\S]*?\n\s*\]);/)[1]);
const dist=(a,b,c,d)=>{const R=6371000,r=x=>x*Math.PI/180;
 const dφ=r(c-a),dλ=r(d-b);const h=Math.sin(dφ/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dλ/2)**2;
 return Math.round(2*R*Math.asin(Math.sqrt(h)));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const out=[];
 for(const [name,addr] of T){
  const s=shops.find(x=>x.n===name);
  const r=await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(addr));
  const j=await r.json();
  let rec={name,addr,cur:[s.lat,s.lng],a:s.a};
  if(j&&j.length){
    const best=j.reduce((x,y)=>y.properties.title.length>x.properties.title.length?y:x);
    rec.hit=best.properties.title;
    rec.new=[best.geometry.coordinates[1],best.geometry.coordinates[0]];
    rec.banchi=/[0-9０-９]/.test(rec.hit);
    rec.dist=dist(s.lat,s.lng,rec.new[0],rec.new[1]);
  }
  out.push(rec);
  console.log((rec.dist!=null?String(rec.dist).padStart(5)+'m':'  ---')+'  '+name.padEnd(26).slice(0,26)+'  a='+s.a.padEnd(14).slice(0,14)+'  GSI='+(rec.hit||'解決せず')+(rec.banchi?'':' ★番地なし'));
  await sleep(400);
 }
 fs.writeFileSync('tools/fix19.json',JSON.stringify(out,null,1));
})();
