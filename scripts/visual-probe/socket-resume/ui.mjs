import { sleep } from "./cdp.mjs";
// Click the first visible element whose text / aria-label matches, with a REAL mouse event at its centre.
export async function click(s, pattern, { selector = "button,[role=button],[role=menuitem]", timeout = 20000 } = {}) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const r = await s.evaluate(`(() => {
      const re = new RegExp(${JSON.stringify(pattern)}, "i");
      for (const el of document.querySelectorAll(${JSON.stringify(selector)})) {
        const b = el.getBoundingClientRect();
        if ((re.test(el.getAttribute("aria-label") || "") || re.test(el.innerText || "")) && b.width > 0 && b.height > 0) { el.scrollIntoView({block:"center"}); const c = el.getBoundingClientRect(); return { x: c.left + c.width/2, y: c.top + c.height/2 }; }
      }
      return null;
    })()`);
    if (r) {
      for (const type of ["mousePressed", "mouseReleased"])
        await s.send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 });
      return true;
    }
    await sleep(300);
  }
  throw new Error("no clickable match for " + pattern);
}
export async function shot(s, file) {
  const { data } = await s.send("Page.captureScreenshot", { format: "png" });
  (await import("fs")).writeFileSync(file, Buffer.from(data, "base64"));
}
export const frames = (s) => s.evaluate("JSON.stringify({frames: window.__frames, toasts: window.__toasts})").then(JSON.parse);
