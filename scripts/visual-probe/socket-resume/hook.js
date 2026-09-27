// Init script: log every engine frame (out + in) and every resync toast, with page-relative ms.
(() => {
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  window.__frames = []; window.__toasts = []; window.__sockets = [];
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) {
    if (!window.__sockets.includes(this)) window.__sockets.push(this);
    try { window.__frames.push({ at: at(), dir: "out", type: JSON.parse(d).type }); } catch {}
    return send.call(this, d);
  };
  const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, "onmessage");
  Object.defineProperty(WebSocket.prototype, "onmessage", {
    configurable: true,
    get: desc.get,
    set(fn) {
      desc.set.call(this, fn && function (e) {
        try { const m = JSON.parse(e.data); window.__frames.push({ at: at(), dir: "in", type: m.type, code: m.code }); if (m.type === "STATE") window.__lastState = m; } catch {}
        return fn.call(this, e);
      });
    },
  });
  document.addEventListener("visibilitychange", () => window.__frames.push({ at: at(), dir: "vis", type: document.visibilityState }));
  // react-hot-toast renders each toast as [role=status]; poll so a toast that lives
  // for only a few frames is still seen.
  let last = "";
  setInterval(() => {
    const txt = [...document.querySelectorAll("[role=status]")].map((e) => e.textContent).join(" | ");
    if (txt !== last) { last = txt; if (/Board out of date|Board refreshed/.test(txt)) window.__toasts.push({ at: at(), text: txt }); }
  }, 50);
})();
