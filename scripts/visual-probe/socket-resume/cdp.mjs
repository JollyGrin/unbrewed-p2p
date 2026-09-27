// Minimal raw-CDP helper (no Playwright: its attach forces focus emulation, so tabs never hide).
export const B = "http://127.0.0.1:" + (process.env.PORT || 9869);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function newTab(url = "about:blank") {
  return (await fetch(`${B}/json/new?${url}`, { method: "PUT" })).json();
}
export const activate = (id) => fetch(`${B}/json/activate/${id}`);
export const closeTab = (id) => fetch(`${B}/json/close/${id}`);
export async function session(tab) {
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const { r, j } = pending.get(m.id); pending.delete(m.id); m.error ? j(new Error(JSON.stringify(m.error))) : r(m.result); }
    else listeners.forEach((f) => f(m));
  };
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; pending.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => {
    const res = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails).slice(0, 400));
    return res.result.value;
  };
  return { ws, send, evaluate, on: (f) => listeners.push(f), close: () => ws.close() };
}
