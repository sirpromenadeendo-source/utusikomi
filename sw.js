// 写しこみ看板 — Service Worker
//
// 方針：通信を優先する。圏外のときだけ、手元の控えを使う。
//   ・オンライン → 毎回サーバから取る＝更新がすぐ反映される（GitHubの10分キャッシュも待たない）
//   ・圏外       → 手元の控えを返す＝アプリが開く
//
// 以前、キャッシュ優先で作って「更新が反映されない」問題を起こしたため、
// 順番を逆にしてある。ここを入れ替えないこと。
//
// 撤去したくなったら、このファイルの中身を sw_kill.js の内容に差し替えて配る。
// （サーバから消すだけでは、端末に登録が残り続ける）

const CACHE = 'utusikomi-v1';

// 圏外でも開けるように、最初に控えておくもの
const SHELL = [
  './',
  './index.html',
  './qrcode.min.js',
  './manifest.json',
  './icon-192.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // 新しいSWをすぐ有効にする（古いSWを待たない）
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 古い版のキャッシュを片付ける
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // 取得（GET）以外は素通し
  if (req.method !== 'GET') return;
  // 自分のフォルダの中だけ扱う
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    // 画面そのもの（HTML）は、ブラウザのHTTPキャッシュを迂回して必ずサーバに尋ねる。
    // ふつうの fetch() はHTTPキャッシュを経由するため、GitHub Pages の10分キャッシュに
    // 当たって古い版が返る。'no-cache' にすると「変わっていませんか？」と毎回確認し、
    // 変わっていなければ304（数百バイト）で済む。＝更新が即座に反映される。
    const isPage = req.mode === 'navigate' || new URL(req.url).pathname.endsWith('/index.html');
    try {
      // ① まず通信で取りに行く（＝つねに最新）
      const res = await fetch(isPage ? new Request(req, { cache: 'no-cache' }) : req);
      // ② 取れたら控えを更新しておく
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      // ③ 圏外など、通信できないときだけ控えを返す
      const hit = await caches.match(req);
      if (hit) return hit;
      // 画面遷移なら、とにかくアプリ本体を返す
      if (req.mode === 'navigate') {
        const idx = (await caches.match('./index.html')) || (await caches.match('./'));
        if (idx) return idx;
      }
      throw err;
    }
  })());
});

// アプリから版を尋ねられたら答える（設定タブの表示用）
self.addEventListener('message', (e) => {
  if (e.data === 'version' && e.source) e.source.postMessage({ swCache: CACHE });
});
