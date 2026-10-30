(function registerOfflineApplication() {
  if (globalThis.vb6OfflineReady) return globalThis.vb6OfflineReady;
  const base = new URL('./', document.currentScript.src);
  const status = {phase: 'registering', updateAvailable: false, error: null};
  globalThis.vb6OfflineStatus = status;
  const emit = () => globalThis.dispatchEvent(new CustomEvent('vb6:offline', {detail: {...status}}));
  const promise = Promise.resolve().then(async () => {
    if (!/^https?:$/.test(base.protocol) || !globalThis.isSecureContext || !navigator.serviceWorker) {
      status.phase = 'unavailable';
      emit();
      return null;
    }
    if (typeof globalThis.vb6ApplicationReady?.then !== 'function') throw new Error('Application startup promise is unavailable.');
    await globalThis.vb6ApplicationReady;
    if (globalThis.vb6ApplicationStatus?.phase === 'disposed') {status.phase = 'disposed'; emit(); return null;}
    const registration = await navigator.serviceWorker.register(new URL('service-worker.js', base).href, {scope: base.href, updateViaCache: 'none'});
    const watch = worker => {
      if (!worker) return;
      const changed = () => {
        status.updateAvailable = Boolean(registration.waiting);
        if (status.updateAvailable) emit();
        if (['installed', 'activated', 'redundant'].includes(worker.state)) worker.removeEventListener('statechange', changed);
      };
      worker.addEventListener('statechange', changed);
      changed();
    };
    registration.addEventListener('updatefound', () => watch(registration.installing));
    const worker = registration.installing || registration.waiting || registration.active;
    if (!worker) throw new Error('Offline worker was not created.');
    watch(worker);
    if (!['installed', 'activated'].includes(worker.state)) await new Promise((resolve, reject) => {
      const changed = () => {
        if (worker.state === 'redundant') { worker.removeEventListener('statechange', changed); reject(new Error('Offline installation failed; verify the deployed release files.')); }
        else if (['installed', 'activated'].includes(worker.state)) { worker.removeEventListener('statechange', changed); resolve(); }
      };
      worker.addEventListener('statechange', changed);
      changed();
    });
    status.phase = 'ready';
    status.updateAvailable = Boolean(registration.waiting);
    emit();
    return registration;
  });
  globalThis.vb6OfflineReady = promise;
  promise.catch(error => { status.phase = 'error'; status.error = String(error?.message || error); emit(); });
  return promise;
})();