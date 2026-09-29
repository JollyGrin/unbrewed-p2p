/**
 * collect.mjs shells out to the real `gh` CLI, so these tests put a fake
 * `gh` executable first on PATH — its output is a recorded sample of real
 * `gh pr list --json number,title,mergedAt,labels,body,files` output
 * (__fixtures__/gh-pr-list-sample.json, trimmed from a live run against
 * JollyGrin/unbrewed-p2p) — and assert on collect.mjs's own parsing: repo
 * tagging, body truncation, label extraction, and top-level changed paths.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SCRIPT = path.join(__dirname, "collect.mjs");
const SAMPLE = path.join(__dirname, "__fixtures__", "gh-pr-list-sample.json");

/** A fake `gh` on PATH: `gh pr list ...` prints the recorded sample; any
 *  other subcommand exits non-zero so a real call would be obvious. */
const withFakeGh = (behavior, run) => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-collect-gh-"));
  const ghPath = path.join(binDir, "gh");
  fs.writeFileSync(ghPath, behavior);
  fs.chmodSync(ghPath, 0o755);
  try {
    return run(binDir);
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
  }
};

const OK_GH = `#!/usr/bin/env node
const fs = require("fs");
console.log(fs.readFileSync(${JSON.stringify(SAMPLE)}, "utf8"));
`;

const FAILING_GH = `#!/usr/bin/env node
console.error("gh: authentication required");
process.exit(1);
`;

const withEmptyContentDir = (run) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-collect-content-"));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const withEmptyPromosDir = (run) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-collect-promos-"));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const runCollect = (extraArgs, binDir) =>
  spawnSync("node", [SCRIPT, ...extraArgs], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
  });

describe("changelog collect.mjs", () => {
  it("parses gh's recorded output into { repo, number, title, mergedAt, labels, body, changedPaths }", () => {
    withEmptyPromosDir((promos) => {
      const result = withFakeGh(OK_GH, (binDir) =>
        runCollect(
          ["--since", "2026-09-01", "--repos", "JollyGrin/unbrewed-p2p", "--promos", promos],
          binDir,
        ),
      );
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.since).toBe("2026-09-01");
      expect(parsed.prs).toHaveLength(2);

      const [first, second] = parsed.prs;
      expect(first).toMatchObject({
        repo: "JollyGrin/unbrewed-p2p",
        number: 976,
        title: 'unbrewed-p2p-975: remove "Meshy AI" from miniature credit titles',
        mergedAt: "2026-09-27T23:54:16Z",
        labels: [],
      });
      expect(first.changedPaths.sort()).toEqual(["lib", "public", "scripts"]);
      expect(first.body.length).toBeLessThanOrEqual(1500);

      expect(second.labels).toEqual(["art"]);
      expect(second.changedPaths).toEqual(["public"]);
    });
  });

  it("infers --since from the newest entry's date when not given", () => {
    withEmptyPromosDir((promos) =>
      withEmptyContentDir((contentDir) => {
        fs.writeFileSync(
          path.join(contentDir, "old.json"),
          JSON.stringify({ id: "2026-08-01-old", date: "2026-08-01" }),
        );
        fs.writeFileSync(
          path.join(contentDir, "new.json"),
          JSON.stringify({ id: "2026-09-10-new", date: "2026-09-10" }),
        );
        const result = withFakeGh(OK_GH, (binDir) =>
          runCollect(
            ["--repos", "JollyGrin/unbrewed-p2p", "--promos", promos, "--content-dir", contentDir],
            binDir,
          ),
        );
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout).since).toBe("2026-09-10");
      }),
    );
  });

  it("collects candidate promo media with discord-cut and tagline detection", () => {
    withEmptyPromosDir((promos) => {
      fs.writeFileSync(path.join(promos, "thetis.mp4"), "video bytes");
      fs.writeFileSync(path.join(promos, "thetis-discord.mp4"), "smaller video bytes");
      fs.writeFileSync(path.join(promos, "solo-slug.mp4"), "no discord cut");

      const result = withFakeGh(OK_GH, (binDir) =>
        runCollect(["--since", "2026-09-01", "--repos", "JollyGrin/unbrewed-p2p", "--promos", promos], binDir),
      );
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.media).toHaveLength(2);

      const thetis = parsed.media.find((m) => m.slug === "thetis");
      expect(thetis.hasDiscordCut).toBe(true);
      expect(typeof thetis.modifiedAt).toBe("string");

      const solo = parsed.media.find((m) => m.slug === "solo-slug");
      expect(solo.hasDiscordCut).toBe(false);
      expect(solo.tagline).toBeNull();
    });
  });

  it("dies with a clear message when gh exits non-zero", () => {
    withEmptyPromosDir((promos) => {
      const result = withFakeGh(FAILING_GH, (binDir) =>
        runCollect(["--since", "2026-09-01", "--repos", "JollyGrin/unbrewed-p2p", "--promos", promos], binDir),
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/gh pr list failed/);
    });
  });

  it("never writes any file (read-only)", () => {
    withEmptyPromosDir((promos) => {
      const before = fs.readdirSync(promos);
      withFakeGh(OK_GH, (binDir) =>
        runCollect(["--since", "2026-09-01", "--repos", "JollyGrin/unbrewed-p2p", "--promos", promos], binDir),
      );
      expect(fs.readdirSync(promos)).toEqual(before);
    });
  });
});
