/**
 * validate.mjs is a standalone CLI (plain ESM, no jest transform involved),
 * so it's exercised the same way scripts/figures/add-hero-mini.test.js
 * exercises add-hero-mini.cjs: spawn it against a throwaway fixture dir and
 * assert on exit code + stderr.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SCRIPT = path.join(__dirname, "validate.mjs");

/** A minimal, otherwise-valid entry — overridden per test. */
const baseEntry = (overrides = {}) => ({
  id: "2026-01-01-sample",
  date: "2026-01-01",
  title: "Sample entry",
  summary: "A sample changelog entry for tests.",
  tags: ["feature"],
  highlight: false,
  ...overrides,
});

const withFixtureDir = (files, run) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-validate-"));
  try {
    for (const [name, contents] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), typeof contents === "string" ? contents : JSON.stringify(contents));
    }
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const runValidate = (dir) => spawnSync("node", [SCRIPT, "--dir", dir], { encoding: "utf8" });

describe("changelog validate.mjs", () => {
  it("passes a well-formed entry", () => {
    const result = withFixtureDir({ "entry.json": baseEntry() }, runValidate);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/passed/);
  });

  it("fails on a missing required field", () => {
    const entry = baseEntry();
    delete entry.summary;
    const result = withFixtureDir({ "entry.json": entry }, runValidate);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/missing required field "summary"/);
  });

  it("fails when the id's date prefix doesn't match the date field", () => {
    const entry = baseEntry({ id: "2026-02-02-sample" });
    const result = withFixtureDir({ "entry.json": entry }, runValidate);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/does not start with its date/);
  });

  it("fails on a duplicate id across files", () => {
    const result = withFixtureDir(
      { "a.json": baseEntry(), "b.json": baseEntry({ title: "Another" }) },
      runValidate,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/duplicate id/);
  });

  it("fails on an issue/PR number reference", () => {
    const entry = baseEntry({ summary: "Fixes the bug from #986." });
    const result = withFixtureDir({ "entry.json": entry }, runValidate);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/issue\/PR reference/);
  });

  it("fails on the word PR", () => {
    const entry = baseEntry({ summary: "This ships in the next PR." });
    const result = withFixtureDir({ "entry.json": entry }, runValidate);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/contains "PR"/);
  });

  it("fails on the word jevx", () => {
    const entry = baseEntry({ summary: "Tuned the jevx3 bot tier." });
    const result = withFixtureDir({ "entry.json": entry }, runValidate);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/contains "jevx"/);
  });

  it("fails on the word DSL", () => {
    const entry = baseEntry({ summary: "Ported the card to the new DSL." });
    const result = withFixtureDir({ "entry.json": entry }, runValidate);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/contains "dsl"/);
  });

  it("fails on the word protocol", () => {
    const entry = baseEntry({ summary: "Bumped the protocol version." });
    const result = withFixtureDir({ "entry.json": entry }, runValidate);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/contains "protocol"/);
  });

  it("fails on the word engine", () => {
    const entry = baseEntry({ summary: "Fixed a desync in the engine." });
    const result = withFixtureDir({ "entry.json": entry }, runValidate);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/contains "engine"/);
  });

  it('fails on the phrase "official deck"', () => {
    const entry = baseEntry({ summary: "Now works with every official deck." });
    const result = withFixtureDir({ "entry.json": entry }, runValidate);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/contains "official deck"/);
  });

  it("fails on an emoji", () => {
    const entry = baseEntry({ summary: "Tabletop view is here! 🎉" });
    const result = withFixtureDir({ "entry.json": entry }, runValidate);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/contains an emoji/);
  });

  it("checks body paragraphs and the cta label too", () => {
    const entry = baseEntry({ body: ["All good here."], cta: { label: "See the PR", href: "/changelog" } });
    const result = withFixtureDir({ "entry.json": entry }, runValidate);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/cta\.label: contains "PR"/);
  });
});
