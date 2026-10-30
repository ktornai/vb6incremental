(function installOfflineWorker(configuration) {
  const scope = new URL(self.registration.scope);
  const prefix = 'vb6-export:' + encodeURIComponent(scope.href) + ':';
  const cacheName = prefix + configuration.revision;
  const entries = new Map(configuration.files.map(entry => [new URL(entry.path, scope).href, entry]));
  const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  async function fetchVerified(url, entry) {
    const response = await fetch(new Request(url, {cache: 'reload', credentials: 'omit', redirect: 'error'}));
    if (!response.ok || response.status !== 200 || response.redirected || response.type === 'opaque' || /(?:^|,)\s*no-store\b/i.test(response.headers.get('cache-control') || '')) throw new Error('Offline file unavailable: ' + entry.path);
    if (!response.body) throw new Error('Offline response body unavailable: ' + entry.path);
    const bytes = new Uint8Array(entry.bytes), reader = response.body.getReader();
    let offset = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        if (offset + value.length > bytes.length) throw new Error('Offline file exceeds expected size: ' + entry.path);
        bytes.set(value, offset); offset += value.length;
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    if (offset !== entry.bytes || hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))) !== entry.sha256) throw new Error('Offline integrity mismatch: ' + entry.path);
    const headers = new Headers(response.headers);
    headers.delete('content-encoding'); headers.set('content-length', String(bytes.length));
    return new Response(bytes, {status: 200, headers});
  }
  self.addEventListener('install', event => {
    event.waitUntil((async () => {
      // Validate the whole release before opening its cache. A partial upload,
      // login redirect, HTML error page or mismatched release fails installation.
      const responses = [];
      for (const [url, entry] of entries) responses.push([url, await fetchVerified(url, entry)]);
      const existed = (await caches.keys()).includes(cacheName);
      try {
        const cache = await caches.open(cacheName);
        for (const [url, response] of responses) await cache.put(url, response);
      } catch (error) {
        // Do not delete an identical release already used by an active worker.
        if (!existed) await caches.delete(cacheName);
        throw error;
      }
    })());
  });
  self.addEventListener('activate', event => {
    event.waitUntil((async () => {
      for (const key of await caches.keys()) if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
    })());
  });
  self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET' || request.headers.has('authorization') || request.headers.has('range')) return;
    const url = new URL(request.url);
    if (url.origin !== scope.origin) return;
    let key = url.href;
    // Only the actual entry page (including launch parameters) has a shell
    // fallback. A missing /api route must never receive the application HTML.
    if (request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === new URL('index.html', scope).pathname)) key = new URL('index.html', scope).href;
    if (!entries.has(key)) return;
    event.respondWith((async () => {
      let cache;
      try {
        cache = await caches.open(cacheName);
        const response = await cache.match(key);
        if (response) return response;
      } catch { /* Private/storage-restricted contexts may still use verified network bytes. */ }
      // Recover evicted entries only when the server still has these exact
      // release bytes. Never mix a new release into an existing client's cache.
      try {
        const restored = await fetchVerified(key, entries.get(key));
        try { await cache?.put(key, restored.clone()); } catch { /* Storage may be full; verified network bytes remain usable. */ }
        return restored;
      } catch {
        // Ask the platform to discover an update without force-activating it.
        event.waitUntil(Promise.resolve().then(() => self.registration.update()).catch(() => {}));
        return new Response('Offline release unavailable. Reconnect, close all application tabs, then reopen to update.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
      }
    })());
  });
})({"revision":"05bbb3fb371fa5cdb46200bbd12bd4fd6de9c3ecd7c5e979fd90fc9c95bb8216","files":[{"path":"app-icon-192.png","bytes":147726,"sha256":"70cbc6026e1194d15dd7b5610c45744d11cdb6f50d499358a4d264b311644015"},{"path":"app-icon-512.png","bytes":1049236,"sha256":"80d707ccc0ab2606ae04f05922fcd13e839b291243dec70bcd8d7bec76c8fb10"},{"path":"app-icon.svg","bytes":337,"sha256":"df6448c799e38870f47868504e31703c3a96dd3e8436fd6c66699a50d5e80203"},{"path":"app.css","bytes":558040,"sha256":"991657ff8bdd2c0c810fd4620b63d05f807a694c1e5c7c870db1cc4384b45d33"},{"path":"app.webmanifest","bytes":538,"sha256":"1afe49b06e203bc41a02f8af77d39f3d8eb7a68b6baa68a08e7424e996491fa5"},{"path":"bootstrap.js","bytes":5258,"sha256":"acb90d24aaaa842e226ab121cd3e6e0547e2c6cdea8484a7dcd2a365ef66ec5c"},{"path":"index.html","bytes":21375,"sha256":"747d42f6296194aa2fef79c2275f217f29c248eccf02da76e771930070883360"},{"path":"offline-register.js","bytes":2580,"sha256":"c17614276f8578b32b64850294c31d6f3344cbbc20d27e8167add0e7e5e335bb"},{"path":"runtime.js","bytes":3099829,"sha256":"990a084ac3c140fd85fc8d1b718418851c319fa8f94fa6663b39a9e746685f65"}]});
