/**
 * @jest-environment jsdom
 */
import {
  engineSpeaksRematch,
  forgetEngineVersion,
  knownEngineVersion,
  rememberEngineVersion,
  resetEngineVersions,
  wireVersionFor,
} from "./wireVersion";
import { PROTOCOL_VERSION } from "./protocol";

const URL_A = "wss://engine.example";
const URL_B = "ws://localhost:8799";

afterEach(() => {
  resetEngineVersions();
  window.sessionStorage.clear();
});

describe("wireVersion", () => {
  // #1201: an engine accepts only a two-version window ({36, 37} since #755) — every bind is at PROTOCOL_VERSION, whatever was learned.
  it("always binds at PROTOCOL_VERSION, never the old v34 fallback", () => {
    expect(wireVersionFor(URL_A)).toBe(PROTOCOL_VERSION);
    rememberEngineVersion(URL_A, 35);
    expect(wireVersionFor(URL_A)).toBe(PROTOCOL_VERSION);
    rememberEngineVersion(URL_A, 40);
    expect(wireVersionFor(URL_A)).toBe(PROTOCOL_VERSION);
    expect(wireVersionFor(URL_B)).toBe(PROTOCOL_VERSION);
  });

  it("gates the rematch UI on an engine that has shown v35+", () => {
    expect(engineSpeaksRematch(URL_A)).toBe(false);
    rememberEngineVersion(URL_A, 34);
    expect(engineSpeaksRematch(URL_A)).toBe(false);
    rememberEngineVersion(URL_A, 36);
    expect(engineSpeaksRematch(URL_A)).toBe(true);
    expect(engineSpeaksRematch(URL_B)).toBe(false);
  });

  it("ignores frames without a numeric v", () => {
    rememberEngineVersion(URL_A, undefined);
    rememberEngineVersion(URL_A, "35");
    expect(knownEngineVersion(URL_A)).toBeNull();
  });

  it("survives a reload through sessionStorage", () => {
    rememberEngineVersion(URL_A, 36);
    resetEngineVersions(); // drops the in-memory copy AND storage…
    expect(engineSpeaksRematch(URL_A)).toBe(false);
    window.sessionStorage.setItem("unbrewed-pro-engine-v-" + URL_A, "36"); // …what a previous page load left
    expect(engineSpeaksRematch(URL_A)).toBe(true);
  });

  it("forget drops what was learned", () => {
    rememberEngineVersion(URL_A, 36);
    forgetEngineVersion(URL_A);
    expect(knownEngineVersion(URL_A)).toBeNull();
  });
});
