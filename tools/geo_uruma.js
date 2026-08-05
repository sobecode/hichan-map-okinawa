const fs = require('fs');
const rows = [
 ['榮料理店','沖縄県うるま市石川伊波1553-463'],
 ['帆掛きそば','沖縄県うるま市宇堅7'],
 ['古民家食堂てぃーらぶい','沖縄県うるま市勝連浜56'],
 ['丸一食品 塩屋店','沖縄県うるま市字塩屋494-6'],
 ['海中茶屋','沖縄県うるま市与那城屋平4'],
 ['うるまジェラート','沖縄県うるま市与那城照間1860-1'],
 ['キングタコス 与勝店','沖縄県うるま市与那城784'],
 ['マカンマカン','沖縄県うるま市石川伊波501'],
 ['うるま市民食堂','沖縄県うるま市字前原183-2'],
 ['丸吉食品','沖縄県うるま市勝連浜72-2'],
 ['タイヨー ステーキ ハウス','沖縄県うるま市字栄野比1183'],
 ['ニューロイヤル','沖縄県うるま市喜仲1-7-5'],
 ['キングタコス あげな店','沖縄県うるま市みどり町4-20-1'],
 ['たかはなり','沖縄県うるま市与那城宮城2768'],
 ['新垣そば','沖縄県うるま市宮里41'],
 ['海畑食堂 てぃあんだ','沖縄県うるま市与那城桃原196'],
 ['沖縄イイダコ屋 うるマルシェ店','沖縄県うるま市字前原183-2'],
 ['かね食堂 与那城店','沖縄県うるま市与那城屋慶名369-1'],
 ['味華','沖縄県うるま市与那城平安座9396-6'],
 ['海をのむ','沖縄県うるま市与那城桃原125'],
 ['うるまキッチン ネリネ','沖縄県うるま市字宮里201-6'],
 ['丸一食品 本店','沖縄県うるま市勝連平敷屋336'],
 ['Sado','沖縄県うるま市高江洲1094-1'],
 ['たまご屋','沖縄県うるま市字赤道660'],
 ['Restaurant B・B・R','沖縄県うるま市大田305'],
 ['大宝そば','沖縄県うるま市具志川2908'],
 ['raise244.','沖縄県うるま市勝連浜243-1'],
 ['テットウ コーヒー','沖縄県うるま市栄野比717'],
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const out=[];
 for(const [name,addr] of rows){
   let rec={name,addr,lat:null,lng:null,hit:null};
   try{
     const r=await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(addr));
     const j=await r.json();
     if(j&&j.length){
       const best=j.reduce((a,b)=>b.properties.title.length>a.properties.title.length?b:a);
       rec.lng=best.geometry.coordinates[0]; rec.lat=best.geometry.coordinates[1]; rec.hit=best.properties.title;
     }
   }catch(e){rec.err=String(e);}
   out.push(rec);
   const banchi=/[0-9０-９]/.test(rec.hit||'')?'':'  <-- 番地なし';
   console.log([name,rec.lat,rec.lng,rec.hit].join(' | ')+banchi);
   await sleep(400);
 }
 fs.writeFileSync(__dirname+'/geo_uruma.json',JSON.stringify(out,null,1));
})();
