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

const URL_A = "wss://engine.example";
const URL_B = "ws://localhost:8799";

afterEach(() => {
  resetEngineVersions();
  window.sessionStorage.clear();
});

describe("wireVersion", () => {
  it("binds at 34 until the engine has shown it speaks 35", () => {
    expect(wireVersionFor(URL_A)).toBe(34);
    rememberEngineVersion(URL_A, 34);
    expect(wireVersionFor(URL_A)).toBe(34);
    expect(engineSpeaksRematch(URL_A)).toBe(false);
    rememberEngineVersion(URL_A, 35);
    expect(wireVersionFor(URL_A)).toBe(35);
    expect(engineSpeaksRematch(URL_A)).toBe(true);
  });

  it("never speaks higher than 35, even to a newer engine", () => {
    rememberEngineVersion(URL_A, 40);
    expect(wireVersionFor(URL_A)).toBe(35);
  });

  it("is per engine URL", () => {
    rememberEngineVersion(URL_A, 35);
    expect(wireVersionFor(URL_B)).toBe(34);
  });

  it("ignores frames without a numeric v", () => {
    rememberEngineVersion(URL_A, undefined);
    rememberEngineVersion(URL_A, "35");
    expect(knownEngineVersion(URL_A)).toBeNull();
  });

  it("survives a reload through sessionStorage (a refresh mid-offer binds at 35 at once)", () => {
    rememberEngineVersion(URL_A, 35);
    resetEngineVersions(); // drops the in-memory copy AND storage…
    expect(wireVersionFor(URL_A)).toBe(34);
    window.sessionStorage.setItem("unbrewed-pro-engine-v-" + URL_A, "35"); // …what a previous page load left
    expect(wireVersionFor(URL_A)).toBe(35);
  });

  it("an engine that went back to 34 is learned again", () => {
    rememberEngineVersion(URL_A, 35);
    rememberEngineVersion(URL_A, 34);
    expect(wireVersionFor(URL_A)).toBe(34);
    rememberEngineVersion(URL_A, 35);
    forgetEngineVersion(URL_A);
    expect(wireVersionFor(URL_A)).toBe(34);
  });
});
