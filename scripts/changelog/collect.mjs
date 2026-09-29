#!/usr/bin/env node
/**
 * collect.mjs — lists everything merged since the newest changelog entry,
 * plus candidate promo media, as JSON on stdout. Feeds the raw materials the
 * `changelog-update` skill turns into copy; it never writes anything itself.
 *
 * Usage:
 *   node scripts/changelog/collect.mjs [options]
 *
 * Options:
 *   --since <yyyy-mm-dd>   Only PRs merged on/after this date.
 *                          Defaults to the newest entry's "date" in
 *                          content/changelog/.
 *   --repos <a/b,c/d>      Comma-separated "owner/repo" list to search.
 *                          Default: JollyGrin/unbrewed-p2p,
 *                                   JollyGrin/unbrewed-engine,
 *                                   JollyGrin/unbrewed-api
 *   --promos <dir>         Promo folder to scan for candidate media.
 *                          Default: /Users/grins/git/unbrewed/deck-promos
 *   --content-dir <dir>    Changelog content dir (for --since inference).
 *                          Default: content/changelog
 *   --limit <n>            Max PRs fetched per repo (gh's own --limit).
 *                          Default: 1000 (gh's own default is only 30).
 *   -h, --help             Show this help.
 *
 * Requires the `gh` CLI, authenticated with read access to the repos above.
 * Read-only: never writes a file, never calls a model.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

const DEFAULT_REPOS = [
  "JollyGrin/unbrewed-p2p",
  "JollyGrin/unbrewed-engine",
  "JollyGrin/unbrewed-api",
];
const DEFAULT_PROMOS = "/Users/grins/git/unbrewed/deck-promos";
const DEFAULT_CONTENT_DIR = join(REPO_ROOT, "content", "changelog");
const DEFAULT_LIMIT = 1000;
const PR_JSON_FIELDS = "number,title,mergedAt,labels,body,files";

function usage() {
  console.log(`Usage: node scripts/changelog/collect.mjs [options]

Prints JSON on stdout listing everything merged since the newest changelog
entry's date, plus candidate promo media. Read-only.

Options:
  --since <yyyy-mm-dd>   Only PRs merged on/after this date.
                         Defaults to the newest entry's "date" in content/changelog/.
  --repos <a/b,c/d>      Comma-separated "owner/repo" list to search.
                         Default: ${DEFAULT_REPOS.join(",")}
  --promos <dir>         Promo folder to scan for candidate media.
                         Default: ${DEFAULT_PROMOS}
  --content-dir <dir>    Changelog content dir (for --since inference).
                         Default: content/changelog
  --limit <n>            Max PRs fetched per repo. Default: ${DEFAULT_LIMIT}
  -h, --help             Show this help.`);
}

function die(message) {
  console.error(`collect: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    since: null,
    repos: DEFAULT_REPOS,
    promos: DEFAULT_PROMOS,
    contentDir: DEFAULT_CONTENT_DIR,
    limit: DEFAULT_LIMIT,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "--since":
        opts.since = argv[++i];
        break;
      case "--repos":
        opts.repos = (argv[++i] ?? "").split(",").filter(Boolean);
        break;
      case "--promos":
        opts.promos = argv[++i];
        break;
      case "--content-dir":
        opts.contentDir = argv[++i];
        break;
      case "--limit":
        opts.limit = Number(argv[++i]);
        break;
      default:
        die(`unrecognized argument "${arg}" (see --help)`);
    }
  }
  return opts;
}

/** The newest entry's "date" field across content/changelog/*.json. */
function newestEntryDate(contentDir) {
  if (!existsSync(contentDir)) return null;
  const files = readdirSync(contentDir).filter((f) => f.endsWith(".json"));
  let newest = null;
  for (const file of files) {
    const entry = JSON.parse(readFileSync(join(contentDir, file), "utf8"));
    if (entry.date && (!newest || entry.date > newest)) newest = entry.date;
  }
  return newest;
}

function collectPRs(repo, since, limit) {
  const result = spawnSync(
    "gh",
    [
      "pr",
      "list",
      "--repo",
      repo,
      "--state",
      "merged",
      "--base",
      "main",
      "--search",
      `merged:>=${since}`,
      "--limit",
      String(limit),
      "--json",
      PR_JSON_FIELDS,
    ],
    { encoding: "utf8" },
  );
  if (result.error?.code === "ENOENT") {
    die("gh CLI not found on PATH. Install it (https://cli.github.com) and retry.");
  }
  if (result.status !== 0) {
    die(`gh pr list failed for ${repo}: ${(result.stderr ?? "").trim()}`);
  }
  let raw;
  try {
    raw = JSON.parse(result.stdout);
  } catch (err) {
    die(`could not parse gh output for ${repo}: ${err.message}`);
  }
  return raw.map((pr) => ({
    repo,
    number: pr.number,
    title: pr.title,
    mergedAt: pr.mergedAt,
    labels: (pr.labels ?? []).map((l) => l.name),
    body: (pr.body ?? "").slice(0, 1500),
    changedPaths: [...new Set((pr.files ?? []).map((f) => f.path.split("/")[0]))].sort(),
  }));
}

function collectMedia(promosDir) {
  if (!existsSync(promosDir)) return [];
  const files = readdirSync(promosDir).filter(
    (f) => f.endsWith(".mp4") && !f.endsWith("-discord.mp4"),
  );
  return files
    .map((file) => {
      const slug = file.slice(0, -".mp4".length);
      const discordPath = join(promosDir, `${slug}-discord.mp4`);
      const propsPath = join(REPO_ROOT, "marketing", "props", `${slug}.json`);
      let tagline = null;
      if (existsSync(propsPath)) {
        try {
          tagline = JSON.parse(readFileSync(propsPath, "utf8")).tagline ?? null;
        } catch {
          tagline = null;
        }
      }
      return {
        slug,
        modifiedAt: statSync(join(promosDir, file)).mtime.toISOString(),
        hasDiscordCut: existsSync(discordPath),
        tagline,
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }
  if (opts.repos.length === 0) die("--repos must list at least one owner/repo");
  if (!Number.isFinite(opts.limit) || opts.limit <= 0) die("--limit must be a positive number");

  const since = opts.since ?? newestEntryDate(opts.contentDir);
  if (!since) {
    die("no --since given and no existing changelog entries to infer a date from");
  }

  const prs = opts.repos.flatMap((repo) => collectPRs(repo, since, opts.limit));
  const media = collectMedia(opts.promos);

  console.log(JSON.stringify({ since, repos: opts.repos, prs, media }, null, 2));
}

main();
