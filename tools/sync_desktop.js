// デスクトップの手元コピー（HTML1枚）を生成する。
// 表紙は相対パス img/ が使えないので cover-750.jpg を data URI に埋め、srcset を落とす。
const fs = require('fs');
const repo = 'C:/Users/kinta/hichan-map/index.html';
const dest = 'C:/Users/kinta/OneDrive/デスクトップ/hichan_map_okinawa (38).html';

let h = fs.readFileSync(repo, 'utf8');
const b64 = fs.readFileSync('C:/Users/kinta/hichan-map/img/cover-750.jpg').toString('base64');

const before = h;
h = h.replace(/src="img\/cover-1000\.jpg"/, `src="data:image/jpeg;base64,${b64}"`);
h = h.replace(/\s*srcset="img\/cover-[^"]*"\r?\n?/, '\n');
if (h === before) throw new Error('cover markup not found — 埋め込みに失敗');
if (/img\/cover-/.test(h)) throw new Error('img/cover- の参照が残っている');

fs.writeFileSync(dest, h, 'utf8');
console.log('synced:', (h.length / 1024).toFixed(0) + 'KB ->', dest);
