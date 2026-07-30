/*
 * モバイル幅での表示を実測する。ヘッドレスChromeをCDPで直接叩くので追加依存はない。
 *   node tools/audit_mobile.js [--width 375] [--shots]
 *
 * 見るもの:
 *  - ページ全体が横スクロールしていないか（していれば原因の要素を挙げる）
 *  - はみ出している要素（ビューポート右端を越える要素）
 *  - 集計表が自分のコンテナ内でスクロールできているか
 *  - タップ対象が小さすぎないか（推奨44px、最低32pxで警告）
 *  - 文字が小さすぎないか
 *  - 固定ナビが画面をどれだけ占めるか
 * --shots を付けるとスクリーンショットを scratchpad に保存する。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const {spawn} = require('child_process');

const wIdx = process.argv.indexOf('--width');
const WIDTH = wIdx > -1 ? Number(process.argv[wIdx + 1]) : 375;
const HEIGHT = 812;
const SHOTS = process.argv.includes('--shots');
const OUTDIR = process.env.SHOT_DIR || path.join(os.tmpdir(), 'hichan-mobile');
const PAGE = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('Chrome が見つかりません'); process.exit(1); }

const PORT = 9222 + (process.pid % 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hichan-prof-'));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--allow-file-access-from-files', `--window-size=${WIDTH},${HEIGHT}`, 'about:blank'
], {stdio: 'ignore'});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const t = list.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) return t.webSocketDebuggerUrl;
    } catch (e) { /* まだ起動していない */ }
    await sleep(250);
  }
  throw new Error('Chrome の DevTools に接続できませんでした');
}

function cdp(ws) {
  let id = 0;
  const waiting = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) {
      const {resolve, reject} = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const myId = ++id;
    waiting.set(myId, {resolve, reject});
    ws.send(JSON.stringify({id: myId, method, params}));
    setTimeout(() => { if (waiting.has(myId)) { waiting.delete(myId); reject(new Error('timeout: ' + method)); } }, 60000);
  });
}

// ページ内で走らせる測定コード。戻り値はJSONで受け取る
const MEASURE = `(() => {
  const vw = window.innerWidth;
  const out = {vw, scrollWidth: document.documentElement.scrollWidth,
               bodyScrollWidth: document.body.scrollWidth, overflow: [], tiny: [], small: [], notes: []};

  const label = el => {
    const id = el.id ? '#' + el.id : '';
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '';
    const txt = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28);
    return el.tagName.toLowerCase() + id + cls + (txt ? ' 「' + txt + '」' : '');
  };

  // はみ出し: 右端がビューポートを2px以上越える要素のうち、はみ出す親を持たない最上位のもの
  const over = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > vw + 2 || r.left < -2) over.push({el, r});
  });
  const isInsideScroller = el => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (/auto|scroll/.test(st.overflowX)) return label(p);
    }
    return null;
  };
  const seen = new Set();
  over.forEach(({el, r}) => {
    const scroller = isInsideScroller(el);
    const key = label(el);
    if (seen.has(key)) return;
    seen.add(key);
    // 横スクロール可能な親の中なら、はみ出しは意図的
    out.overflow.push({who: key, left: Math.round(r.left), right: Math.round(r.right),
                       width: Math.round(r.width), inScroller: scroller});
  });

  // タップ対象
  document.querySelectorAll('button, a, .shop-card, .bd-chip, table.matrix td[onclick]').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const min = Math.min(r.width, r.height);
    if (min < 24) out.tiny.push(label(el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
    else if (min < 32) out.small.push(label(el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
  });

  // 文字サイズ
  const fonts = {};
  document.querySelectorAll('body *').forEach(el => {
    if (!el.firstChild || el.firstChild.nodeType !== 3) return;
    if (!el.firstChild.textContent.trim()) return;
    const px = parseFloat(getComputedStyle(el).fontSize);
    const k = px.toFixed(1);
    (fonts[k] || (fonts[k] = {n: 0, ex: []}));
    fonts[k].n++;
    if (fonts[k].ex.length < 2) fonts[k].ex.push(label(el));
  });
  out.fonts = Object.entries(fonts).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
                   .map(([px, v]) => ({px: +px, n: v.n, ex: v.ex}));

  // 集計表が自分のコンテナ内でスクロールできているか
  const sc = document.querySelector('.matrix-scroll');
  const tb = document.querySelector('table.matrix');
  if (sc && tb) {
    out.matrix = {containerWidth: Math.round(sc.clientWidth), tableWidth: Math.round(tb.scrollWidth),
                  canScroll: sc.scrollWidth > sc.clientWidth + 1,
                  overflowX: getComputedStyle(sc).overflowX};
  }

  // 固定ナビの高さ
  const nav = document.querySelector('.filter-nav');
  if (nav) out.navHeight = Math.round(nav.getBoundingClientRect().height);
  out.viewportShare = out.navHeight ? Math.round(out.navHeight / window.innerHeight * 100) : null;

  // 主要ブロックの幅
  out.blocks = ['.hero', '.map-wrap', '#map', '.container', '.shop-grid', '.area-breakdown', 'footer']
    .map(sel => { const el = document.querySelector(sel); if (!el) return null;
                  const r = el.getBoundingClientRect();
                  return {sel, width: Math.round(r.width), right: Math.round(r.right)}; })
    .filter(Boolean);

  out.shopCount = document.querySelectorAll('.shop-card').length;
  return JSON.stringify(out);
})()`;

(async () => {
  try {
    const wsUrl = await findTarget();
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const send = cdp(ws);

    await send('Page.enable');
    await send('Runtime.enable');
    // 実機に近づける: DPR2・タッチ・モバイル扱い
    await send('Emulation.setDeviceMetricsOverride',
      {width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true});
    await send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});

    await send('Page.navigate', {url: PAGE});
    await sleep(4000); // Leaflet と地図タイルの読み込み待ち

    const {result} = await send('Runtime.evaluate', {expression: MEASURE, returnByValue: true});
    const d = JSON.parse(result.value);

    console.log(`=== 幅 ${d.vw}px で実測（カード ${d.shopCount} 枚）===\n`);

    const pageScrolls = d.scrollWidth > d.vw + 1;
    console.log(`■ ページ全体の横スクロール: ${pageScrolls ? '★あり' : 'なし'}` +
                `（documentElement.scrollWidth ${d.scrollWidth} / 表示幅 ${d.vw}）`);

    const real = d.overflow.filter(o => !o.inScroller);
    const intended = d.overflow.filter(o => o.inScroller);
    console.log(`\n■ ビューポートからはみ出す要素: ${d.overflow.length} 件` +
                `（うち横スクロール可能な親の中＝意図どおり ${intended.length} 件）`);
    if (real.length) {
      console.log('  ★意図しないはみ出し:');
      real.slice(0, 15).forEach(o => console.log(`     ${o.who}  left${o.left} right${o.right} 幅${o.width}`));
      if (real.length > 15) console.log(`     ...他 ${real.length - 15} 件`);
    } else console.log('  意図しないはみ出しなし');

    if (d.matrix) {
      console.log(`\n■ 集計表: コンテナ幅 ${d.matrix.containerWidth} / 表の幅 ${d.matrix.tableWidth}` +
                  ` / overflow-x:${d.matrix.overflowX} / 中でスクロールできる:${d.matrix.canScroll ? 'はい' : '★いいえ'}`);
      if (!d.matrix.canScroll && d.matrix.tableWidth <= d.matrix.containerWidth + 1) {
        console.log('     表がコンテナに収まっている。列が潰れていないか要確認');
      }
    }

    console.log(`\n■ 固定ナビの高さ: ${d.navHeight}px（画面の ${d.viewportShare}%）`);

    console.log(`\n■ タップ対象が小さい: 24px未満 ${d.tiny.length} 件 / 24〜32px ${d.small.length} 件`);
    d.tiny.slice(0, 10).forEach(x => console.log('  ★' + x));
    d.small.slice(0, 10).forEach(x => console.log('   ' + x));
    if (d.small.length > 10) console.log(`   ...他 ${d.small.length - 10} 件`);

    console.log('\n■ 文字サイズの分布');
    d.fonts.forEach(f => console.log(`   ${String(f.px).padStart(5)}px  ${String(f.n).padStart(5)}箇所  ${f.ex[0] || ''}`));

    console.log('\n■ 主要ブロックの幅');
    d.blocks.forEach(b => console.log(`   ${b.sel.padEnd(18)} 幅${String(b.width).padStart(4)}  右端${b.right}`));

    if (SHOTS) {
      fs.mkdirSync(OUTDIR, {recursive: true});
      const shot = async (name, y) => {
        await send('Runtime.evaluate', {expression: `window.scrollTo(0,${y})`});
        await sleep(700);
        const {data} = await send('Page.captureScreenshot', {format: 'png'});
        const p = path.join(OUTDIR, `${WIDTH}-${name}.png`);
        fs.writeFileSync(p, Buffer.from(data, 'base64'));
        console.log('  保存:', p);
      };
      console.log('\n■ スクリーンショット');
      await shot('01-top', 0);
      await shot('02-nav', 700);
      await shot('03-cards', 1400);
      const {result: h} = await send('Runtime.evaluate',
        {expression: 'document.documentElement.scrollHeight', returnByValue: true});
      await shot('04-matrix', h.value - HEIGHT - 80);
    }

    ws.close();
  } catch (e) {
    console.error('失敗:', e.message);
    process.exitCode = 1;
  } finally {
    chrome.kill();
    try { fs.rmSync(profile, {recursive: true, force: true}); } catch (e) {}
  }
})();
