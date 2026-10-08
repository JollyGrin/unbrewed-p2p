/**
 * The map lock's content hash (#1268, hardening contract item 3). jsdom has no
 * `crypto.subtle`, so each test that hashes installs Node's WebCrypto — and the
 * "no WebCrypto" case runs without it, as jsdom ships.
 */
import { webcrypto } from "node:crypto";

import { catalogEntry, MAP_CATALOG } from "@/lib/pro/mapCatalog";
import { ticketBoard } from "@/lib/pro/tournamentTicket";

import { canonicalJson, mapLockHash, ruleWithMapHash, sha256Hex, withMapHash } from "./mapHash";

const jsdomCrypto = globalThis.crypto;
const withWebCrypto = () => Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
afterEach(() => Object.defineProperty(globalThis, "crypto", { configurable: true, value: jsdomCrypto }));

/** Shared by all three repos (contract item 3). */
const VECTOR_IN = '{"slug":"vec","w":2,"cells":[{"z":1,"a":"é"},null,true],"b":{"y":1.5,"x":[]}}';
const VECTOR_CANONICAL = '{"b":{"x":[],"y":1.5},"cells":[{"a":"é","z":1},null,true],"slug":"vec","w":2}';
const VECTOR_SHA = "0a027b111c62c9ce4511307d39aea85e6566d4cfc6b64c59f04f80b2d7c3c3b0";

describe("canonicalJson + sha256Hex — the shared test vector", () => {
  it("canonicalises the vector exactly", () => {
    expect(canonicalJson(JSON.parse(VECTOR_IN))).toBe(VECTOR_CANONICAL);
  });

  it("hashes it to the contract's digest (UTF-8 bytes, lowercase hex)", async () => {
    withWebCrypto();
    expect(await sha256Hex(canonicalJson(JSON.parse(VECTOR_IN)))).toBe(VECTOR_SHA);
  });

  it("sorts keys by code unit, not locale (uppercase before lowercase)", () => {
    expect(canonicalJson({ b: 1, B: 2, a: 3, _: 4 })).toBe('{"B":2,"_":4,"a":3,"b":1}');
  });
});

describe("mapLockHash — the board a ticketed CREATE_ROOM sends", () => {
  it("is the hash of ticketBoard's customMap (round-tripped through JSON like the wire)", async () => {
    withWebCrypto();
    const board = ticketBoard({ kind: "catalog", id: "counts-castle" });
    const sent = board.ok ? board.customMap : undefined;
    expect(sent).toBe(catalogEntry("counts-castle")!.map);
    const wire = JSON.parse(JSON.stringify({ customMap: sent })).customMap;
    expect(await mapLockHash({ kind: "catalog", id: "counts-castle" })).toBe(await sha256Hex(canonicalJson(wire)));
    expect(await mapLockHash({ kind: "catalog", id: "counts-castle" })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("every pickable catalog board hashes (except engine boards, which send no customMap)", async () => {
    withWebCrypto();
    for (const e of MAP_CATALOG.filter((m) => !m.hidden)) {
      const h = await mapLockHash({ kind: "catalog", id: e.id });
      if (e.serverDefault) expect(h).toBeNull();
      else expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("Mended Drum (an engine board) and an unknown/custom map get no hash", async () => {
    withWebCrypto();
    expect(await mapLockHash({ kind: "catalog", id: "mended-drum" })).toBeNull();
    expect(await mapLockHash({ kind: "catalog", id: "no-such-board" })).toBeNull();
    expect(await mapLockHash({ kind: "custom", id: "counts-castle" })).toBeNull();
  });

  it("no WebCrypto (jsdom, an insecure context): no hash, never a throw", async () => {
    expect(globalThis.crypto?.subtle).toBeUndefined();
    expect(await mapLockHash({ kind: "catalog", id: "counts-castle" })).toBeNull();
    expect(await withMapHash({ kind: "catalog", id: "counts-castle" })).toEqual({ kind: "catalog", id: "counts-castle" });
  });
});

describe("ruleWithMapHash", () => {
  it("adds the hash to the rule's map lock, recomputing a stale one", async () => {
    withWebCrypto();
    const h = await mapLockHash({ kind: "catalog", id: "weathertop" });
    expect(await ruleWithMapHash({ mode: "map", map: { kind: "catalog", id: "weathertop", hash: "f".repeat(64) } })).toEqual({
      mode: "map",
      map: { kind: "catalog", id: "weathertop", hash: h },
    });
  });

  it("leaves a rule without a map, an engine board, and null untouched", async () => {
    withWebCrypto();
    expect(await ruleWithMapHash({ mode: "free" })).toEqual({ mode: "free" });
    expect(await ruleWithMapHash({ mode: "map", map: { kind: "catalog", id: "mended-drum" } })).toEqual({
      mode: "map",
      map: { kind: "catalog", id: "mended-drum" },
    });
    expect(await ruleWithMapHash(null)).toBeNull();
  });
});
