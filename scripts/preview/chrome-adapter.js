/**
 * Browser-preview adapter only. Never loaded by the installed extension.
 * This intentionally uses page memory, not chrome.storage or user records.
 * Reloading clears it. Capture permissions and cross-tab persistence are not tested.
 */
(() => {
  const records = Object.create(null);
  const listeners = new Set();
  const clone = value => structuredClone(value);
  const notify = changes => {
    queueMicrotask(() => listeners.forEach(listener => listener(changes, 'local')));
  };

  globalThis.chrome = {
    storage: {
      local: {
        async setAccessLevel() {},
        async get(key) {
          if (key === null) return clone(records);
          return { [key]: clone(records[key]) };
        },
        async set(values) {
          const changes = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { oldValue: clone(records[key]), newValue: clone(value) };
            records[key] = clone(value);
          }
          notify(changes);
        },
        async remove(key) {
          const oldValue = clone(records[key]);
          delete records[key];
          notify({ [key]: { oldValue } });
        },
      },
      onChanged: { addListener: listener => listeners.add(listener) },
    },
    tabs: {
      async query() { return [{ id: 1, url: location.href }]; },
      async create({ url }) { location.href = url; },
    },
    runtime: {
      getURL(path) {
        const url = new URL(path, document.baseURI);
        const file = url.pathname.split('/').at(-1);
        if (file === 'app.html') url.pathname = new URL('./', document.baseURI).pathname;
        if (file === 'popup.html') url.pathname = new URL('popup/', document.baseURI).pathname;
        return url.href;
      },
    },
  };
})();
