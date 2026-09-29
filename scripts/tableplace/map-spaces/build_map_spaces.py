#!/usr/bin/env python3
"""Build lib/tableplace/mapSpaces.json: printed space centres for /table snap points.

Every built-in map without a Pro def gets its spaces from one of two sources:

  club  the-unmatched.club maps (`community-*`): the club's own editor data
        (circles + startingPosition), fetched as the translate-map pipeline's
        ingest_unmatched.py does. The editor canvas -> our image mapping (scale
        and a small offset) is fitted by disc coverage: each projected disc
        must land on its own slice colours.
  cv    legacy and official boards: the pipeline's ring detector
        (analyze_board.py), circles only. A human reviewed every overlay;
        `decisions.json` records which detected rings are board art
        (`reject`/`keep`), which boards were left out and why, and the start
        slots read off the printed diamonds.

Usage (Python from the pipeline's venv; PIPE defaults to
~/git/unbrewed/map-translation-pipeline):

  $PIPE/.venv/bin/python scripts/tableplace/map-spaces/build_map_spaces.py WORK club
  $PIPE/.venv/bin/python scripts/tableplace/map-spaces/build_map_spaces.py WORK cv
  $PIPE/.venv/bin/python scripts/tableplace/map-spaces/build_map_spaces.py WORK build

`club` and `cv` write per-map working files under WORK; `build` writes
mapSpaces.json and an overlay per map (WORK/overlays/<map>.png) to review.
"""
import json, math, os, re, statistics, subprocess, sys, urllib.parse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
PIPE = Path(os.environ.get("PIPE", Path.home() / "git/unbrewed/map-translation-pipeline"))
DEFAULT_MAPS = REPO / "components/Bag/Map/MapModal/defaultMaps.json"
OUT = REPO / "lib/tableplace/mapSpaces.json"
DECISIONS = json.load(open(HERE / "decisions.json"))


def maps():
    return [(m["imgUrl"].split("/")[-1][:-5], m) for m in json.load(open(DEFAULT_MAPS))]


def board_png(work: Path, name: str) -> Path:
    p = work / name / "board.png"
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        Image.open(REPO / "public/maps" / f"{name}.webp").convert("RGB").save(p)
    return p


def hex2rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


# ── club ────────────────────────────────────────────────────────────────────

def fit_club(doc, png):
    """Scale s and offset (tx, ty), canvas -> image px, maximising the share of
    disc sample points that match one of that circle's slice colours."""
    im = np.asarray(Image.open(png).convert("RGB")).astype(np.int16)
    H, W = im.shape[:2]
    C = doc["circles"]
    cx = np.array([c["x"] for c in C], float)
    cy = np.array([c["y"] for c in C], float)
    cr = np.array([c.get("radius") or doc["circleRadius"] for c in C], float)
    cols = [np.array([hex2rgb(s["color"]) for s in c["slices"]]) for c in C]
    ang = np.linspace(0, 2 * np.pi, 24, endpoint=False)
    ox = np.concatenate([f * np.cos(ang) for f in (0.35, 0.6, 0.82)])
    oy = np.concatenate([f * np.sin(ang) for f in (0.35, 0.6, 0.82)])

    def score(s, tx, ty):
        px = ((cx[:, None] + cr[:, None] * ox[None]) * s + tx).round().astype(int)
        py = ((cy[:, None] + cr[:, None] * oy[None]) * s + ty).round().astype(int)
        inb = (px >= 0) & (px < W) & (py >= 0) & (py < H)
        px, py = px.clip(0, W - 1), py.clip(0, H - 1)
        hits = 0
        for i in range(len(C)):
            d = np.abs(im[py[i], px[i]][:, None, :] - cols[i][None]).max(-1).min(-1)
            hits += ((d < 60) & inb[i]).sum()
        return hits / px.size

    # coarse scale by centre colour alone (ingest_unmatched.calibrate_scale)
    sys.path.insert(0, str(PIPE / "scripts"))
    import ingest_unmatched as iu
    s0, _, _ = iu.calibrate_scale(C, png)
    best = (score(s0, 0, 0), s0, 0, 0)
    for s in np.arange(s0 - 0.04, s0 + 0.0405, 0.002):
        for tx in range(-16, 17, 4):
            for ty in range(-16, 17, 4):
                v = score(s, tx, ty)
                if v > best[0]:
                    best = (v, s, tx, ty)
    _, s1, tx1, ty1 = best
    for s in np.arange(s1 - 0.003, s1 + 0.0031, 0.0005):
        for tx in range(tx1 - 4, tx1 + 5):
            for ty in range(ty1 - 4, ty1 + 5):
                v = score(s, tx, ty)
                if v > best[0]:
                    best = (v, s, tx, ty)
    return {"cover": round(float(best[0]), 3), "s": round(float(best[1]), 4),
            "tx": int(best[2]), "ty": int(best[3]), "W": W, "H": H}


def club(work: Path):
    sys.path.insert(0, str(PIPE / "scripts"))
    import ingest_unmatched as iu
    for name, m in maps():
        if m["source"] != "community" or name in DECISIONS["skip"] or name in DECISIONS["pro"]:
            continue
        d = work / name
        d.mkdir(parents=True, exist_ok=True)
        tail = m["meta"]["url"].split("/c/maps/")[1]
        page = "https://www.the-unmatched.club/c/maps/" + urllib.parse.quote(tail)
        doc = iu.extract_map(iu.curl(page + "/__data.json"))["document"]
        json.dump(doc, open(d / "document.json", "w"), indent=1)
        fit = fit_club(doc, board_png(work, name))
        json.dump(fit, open(d / "fit.json", "w"))
        print(name, len(doc["circles"]), fit, flush=True)


def club_entry(work: Path, name: str):
    doc = json.load(open(work / name / "document.json"))
    f = json.load(open(work / name / "fit.json"))
    s, tx, ty, W, H = f["s"], f["tx"], f["ty"], f["W"], f["H"]
    C = doc["circles"]
    spaces = [{"x": round((c["x"] * s + tx) / W, 4), "y": round((c["y"] * s + ty) / H, 4)} for c in C]
    slots = [((c.get("startingPosition") or {}).get("position"), p) for c, p in zip(C, spaces)]
    diameter = 2 * statistics.median(c.get("radius") or doc["circleRadius"] for c in C) * s / W
    return spaces, round(diameter, 4), [(slot, p) for slot, p in slots if slot]


# ── cv ──────────────────────────────────────────────────────────────────────

def cv(work: Path):
    for name, dec in DECISIONS["cv"].items():
        png = board_png(work, name)
        out = work / name / dec["style"]
        out.mkdir(parents=True, exist_ok=True)
        subprocess.run([str(PIPE / ".venv/bin/python"), str(PIPE / "scripts/analyze_board.py"),
                        str(png), str(out), "--style", dec["style"]], check=True, capture_output=True)
        print(name, "ok", flush=True)


def cv_entry(work: Path, name: str):
    dec = DECISIONS["cv"][name]
    an = json.load(open(work / name / dec["style"] / "analysis.json"))
    W = an["image"]["width"]
    ok = (lambda c: c["id"] in dec["keep"]) if "keep" in dec else (lambda c: c["id"] not in dec["reject"])
    circles = [c for c in an["circles"] if ok(c)]
    spaces = [{"x": c["x_norm"], "y": c["y_norm"]} for c in circles]
    diameter = 2 * statistics.median(c["r"] for c in circles) / W
    by_id = {c["id"]: sp for c, sp in zip(circles, spaces)}
    starts = [(int(slot), by_id[cid]) for slot, cid in dec.get("starts", {}).items()]
    return spaces, round(diameter, 4), starts


# ── build ───────────────────────────────────────────────────────────────────

def overlay(png: Path, entry, out: Path, title: str):
    im = Image.open(png).convert("RGB")
    W, H = im.size
    d = ImageDraw.Draw(im)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", max(12, W // 70))
    r = entry["spaceDiameter"] * W / 2
    for i, p in enumerate(entry["spaces"]):
        x, y = p["x"] * W, p["y"] * H
        d.ellipse([x - r, y - r, x + r, y + r], outline=(255, 0, 255), width=3)
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(0, 255, 0))
    for s in entry.get("starts", []):
        x, y = s["x"] * W, s["y"] * H
        d.text((x - 12, y - 10), f"S{s['slot']}", fill=(0, 255, 255), font=font, stroke_width=3, stroke_fill=(0, 0, 0))
    d.text((6, 6), f"{title}: {len(entry['spaces'])} spaces, "
           f"{len(entry.get('starts', []))} starts [{entry['source']}]",
           fill=(255, 255, 255), font=font, stroke_width=3, stroke_fill=(0, 0, 0))
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)


def min_gap(spaces, ratio):
    """Closest pair of centres, as a fraction of image WIDTH."""
    pts = [(p["x"], p["y"] / ratio) for p in spaces]
    return min(math.dist(a, b) for i, a in enumerate(pts) for b in pts[i + 1:])


def build(work: Path):
    result = {}
    for name, m in maps():
        if name in DECISIONS["skip"] or name in DECISIONS["pro"]:
            continue
        if m["source"] == "community":
            spaces, diameter, starts = club_entry(work, name)
            source = "club"
        elif name in DECISIONS["cv"]:
            spaces, diameter, starts = cv_entry(work, name)
            source = "cv"
        else:
            sys.exit(f"{name}: no decision recorded (add it to cv, skip or pro)")
        counts = {}
        for slot, _ in starts:
            counts[slot] = counts.get(slot, 0) + 1
        # a slot printed twice is a data error: drop it; no 1 + 2 pair, no starts
        starts = [{"slot": slot, **p} for slot, p in sorted(starts, key=lambda t: t[0]) if counts[slot] == 1]
        if not {1, 2} <= {s["slot"] for s in starts}:
            starts = []
        entry = {"spaces": spaces, "spaceDiameter": diameter,
                 **({"starts": starts} if starts else {}), "source": source}
        result[m["imgUrl"]] = entry
        png = board_png(work, name)
        ratio = Image.open(png).width / Image.open(png).height
        overlay(png, entry, work / "overlays" / f"{name}.png", name)
        print(f"{name:48} {source:4} {len(spaces):3} spaces  diam {diameter:.4f}  "
              f"gap/diam {min_gap(spaces, ratio) / diameter:.2f}  starts {[s['slot'] for s in starts]}")
    text = json.dumps(result, indent=1)
    # one space (or start slot) per line
    text = re.sub(r"\{\s+((?:\"\w+\": [\d.]+,?\s+)+)\}",
                  lambda m: "{" + " ".join(m.group(1).split()) + "}", text)
    OUT.write_text(text + "\n")
    print(f"wrote {len(result)} maps to {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    work, stage = Path(sys.argv[1]), sys.argv[2]
    {"club": club, "cv": cv, "build": build}[stage](work)
