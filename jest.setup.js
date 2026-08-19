/**
 * jsdom ships without TextEncoder/TextDecoder (they are Node globals, and the
 * browser's live on `window` where jsdom simply doesn't implement them).
 * `react-dom/server` reads TextEncoder at import time, so any test that touches
 * the string-rendered board-token path (`components/BoardCanvas/Tokens/*`)
 * fails to even load the module without this.
 */
const { TextDecoder, TextEncoder } = require("node:util");

if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;
