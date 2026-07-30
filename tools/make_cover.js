/*
 * 表紙画像を用途別サイズのJPEGへ書き出す。
 *   node tools/make_cover.js "<元画像のパス>"
 *
 * 元は 1254x1254 / 3.1MB のPNGで、モバイル回線で先頭に読ませるには重すぎる。
 * ヘッドレスChromeのcanvasで縮小してJPEGにする（追加パッケージなしで
 * 高品質なリサンプリングとエンコードができる）。出力は img/cover-*.jpg。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const {spawn} = require('child_process');

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) { console.error('元画像のパスを渡してください'); process.exit(1); }
const OUT = path.join(__dirname, '..', 'img');
fs.mkdirSync(OUT, {recursive: true});

// 元画像より大きく書き出しても画質は上がらず容量だけ増えるので、実寸を上限にする。
// 1254 は 1280px 幅デスクトップ相当、750 は 375px 幅×DPR2 のスマホ相当。
const SIZES = [{w: 0, q: 0.80, name: 'cover-1254.jpg'},   // w:0 は元画像の幅を使う
                {w: 1000, q: 0.80, name: 'cover-1000.jpg'},
                {w: 750,  q: 0.78, name: 'cover-750.jpg'}];

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hichan-img-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions',
  '--allow-file-access-from-files', 'about:blank'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let ws;
  try {
    let url;
    for (let i = 0; i < 60 && !url; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        url = (list.find(x => x.type === 'page' && x.webSocketDebuggerUrl) || {}).webSocketDebuggerUrl;
      } catch (e) {}
      if (!url) await sleep(250);
    }
    ws = new WebSocket(url);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    let id = 0; const wait = new Map();
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && wait.has(m.id)) { const w = wait.get(m.id); wait.delete(m.id);
        m.error ? w.j(new Error(m.error.message)) : w.r(m.result); }
    });
    const send = (method, params = {}) => new Promise((r, j) => {
      const i = ++id; wait.set(i, {r, j}); ws.send(JSON.stringify({id: i, method, params}));
      setTimeout(() => { if (wait.has(i)) { wait.delete(i); j(new Error('timeout ' + method)); } }, 120000);
    });
    const evalJs = async expr => {
      const {result, exceptionDetails} = await send('Runtime.evaluate',
        {expression: expr, returnByValue: true, awaitPromise: true});
      if (exceptionDetails) throw new Error(exceptionDetails.text + ' ' +
        (exceptionDetails.exception && exceptionDetails.exception.description || ''));
      return result.value;
    };

    await send('Runtime.enable');
    // file:// のページを開かないと同一オリジン扱いにならず canvas が汚染される
    const blank = path.join(profile, 'blank.html');
    fs.writeFileSync(blank, '<!doctype html><title>enc</title>', 'utf8');
    await send('Page.enable');
    await send('Page.navigate', {url: 'file:///' + blank.replace(/\\/g, '/')});
    await sleep(800);

    const srcUrl = 'file:///' + path.resolve(SRC).replace(/\\/g, '/');
    const meta = await evalJs(`(async () => {
      window.__img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im); im.onerror = () => rej(new Error('画像を読めません'));
        im.src = ${JSON.stringify(srcUrl)};
      });
      return JSON.stringify({w: window.__img.naturalWidth, h: window.__img.naturalHeight});
    })()`);
    const {w: ow, h: oh} = JSON.parse(meta);
    console.log(`元画像: ${ow}x${oh}\n`);

    for (const s of SIZES) {
      if (!s.w || s.w > ow) s.w = ow;
      const h = Math.round(oh * (s.w / ow));
      const data = await evalJs(`(() => {
        const c = document.createElement('canvas');
        c.width = ${s.w}; c.height = ${h};
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(window.__img, 0, 0, ${s.w}, ${h});
        return c.toDataURL('image/jpeg', ${s.q}).split(',')[1];
      })()`);
      const buf = Buffer.from(data, 'base64');
      fs.writeFileSync(path.join(OUT, s.name), buf);
      console.log(`${s.name.padEnd(16)} ${s.w}x${h}  品質${s.q}  ${Math.round(buf.length / 1024)} KB`);
    }
    console.log(`\n出力先: ${OUT}`);
  } catch (e) {
    console.error('失敗:', e.message);
    process.exitCode = 1;
  } finally {
    if (ws) ws.close();
    chrome.kill();
    try { fs.rmSync(profile, {recursive: true, force: true}); } catch (e) {}
  }
})();
