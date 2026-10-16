/*
 * detail_*.json の各店について、食べログ店舗ページのピックアップ口コミ(見出し＋冒頭)とPRを出す。
 * 説明文・名物を「書かれている事実だけ」で書くための材料。
 *   node tools/tabelog_reviews.js detail_rank_X.json [文字数=130]
 */
'use strict';
const path = require('path');
const d = require(path.resolve(__dirname, process.argv[2]));
const LEN = Number(process.argv[3] || 130);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const t = s => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').replace(/詳細を見る$/, '').trim();
(async () => {
  for (const x of d) {
    const h = await (await fetch(`https://tabelog.com/okinawa/${x.tl}/`, {headers: {'User-Agent': UA}})).text();
    const titles = [...h.matchAll(/rstdtl-rvw__title-target[^>]*>([\s\S]*?)<\/a>/g)].map(m => t(m[1]));
    const com = [...h.matchAll(/rstdtl-rvw__comment[^>]*>([\s\S]*?)<\/div>/g)].map(m => t(m[1]).slice(0, LEN));
    const pr = (h.match(/pr-comment-title[^>]*>([\s\S]*?)<\/h3>/) || [])[1];
    console.log(`■${x.name}${pr ? ' 〈PR〉' + t(pr) : ''}\n   ${titles.join(' / ')}\n   ${com.join('\n   ')}`);
    await new Promise(r => setTimeout(r, 1200));
  }
})();
