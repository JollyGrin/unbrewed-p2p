/**
 * Pure data model + transforms for the dev map annotation editor
 * (docs/pro/tasks/T-009). Kept framework-free so the reducer-ish mutations and
 * the import/export shims are unit-testable without React.
 *
 * The editor's internal draft is `MapDoc`; the shipped export is `ProMapDef`
 * (== engine MapDef). `toMapDef`/`toMapDoc` are byte-compatible with the
 * original single-file editor so old drafts load and round-trips diff clean.
 */
import type { ProMapDef } from "@/lib/pro/protocol";

export type Zone = { id: string; color: string; label: string };
export type Space = {
  id: string;
  x: number; // normalized 0-1 of image width
  y: number; // normalized 0-1 of image height
  zones: string[];
  adjacentTo: string[]; // symmetric edges
  oneWayTo?: string[]; // directed edges (e.g. Mended Drum's stairs drop)
  start?: number; // player slot 1-4
};
export type MapDoc = {
  meta: {
    title: string;
    imageUrl: string;
    players: number[];
    source: string;
    license: string;
    /** space circle diameter as a fraction of image WIDTH (renderers reuse this) */
    spaceDiameter?: number;
  };
  zones: Zone[];
  spaces: Space[];
};

export const ZONE_PRESETS = [
  "#3182ce", "#e53e3e", "#38a169", "#d69e2e", "#805ad5",
  "#dd6b20", "#319795", "#b83280", "#718096", "#744210",
];

export const STORAGE_KEY = "unbrewed-map-editor-draft";
export const DEFAULT_DIAMETER = 0.021;

export const emptyDoc = (): MapDoc => ({
  meta: {
    title: "", imageUrl: "", players: [1, 2], source: "",
    license: "community map — credit the author",
    spaceDiameter: DEFAULT_DIAMETER,
  },
  zones: [],
  spaces: [],
});

export const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "custom";

export const spaceById = (doc: MapDoc, id: string): Space | undefined =>
  doc.spaces.find((s) => s.id === id);

/**
 * Editor draft (`MapDoc`) -> engine-native `ProMapDef` (== server MapDef). This
 * is the shipped export shape: the pro-server ingests it directly and community
 * members paste it straight into /pro/game's custom-map box. minPlayers/maxPlayers
 * derive from the start slots actually placed (min 2 — Unmatched is 1v1+).
 */
export const toMapDef = (doc: MapDoc): ProMapDef => {
  const slots = doc.spaces
    .map((s) => s.start)
    .filter((n): n is number => typeof n === "number");
  const maxPlayers = slots.length ? Math.max(2, ...slots) : 2;
  return {
    schemaVersion: "1.0",
    id: slugify(doc.meta.title),
    meta: {
      title: doc.meta.title || "Custom Map",
      minPlayers: 2,
      maxPlayers,
      specialRules: false,
      ...(doc.meta.imageUrl ? { imageUrl: doc.meta.imageUrl } : {}),
      ...(doc.meta.spaceDiameter != null ? { spaceDiameter: doc.meta.spaceDiameter } : {}),
      ...(doc.meta.source ? { source: doc.meta.source } : {}),
      ...(doc.meta.license ? { license: doc.meta.license } : {}),
    },
    zones: doc.zones,
    spaces: doc.spaces.map((s) => ({
      id: s.id,
      x: s.x,
      y: s.y,
      zones: s.zones,
      adjacentTo: s.adjacentTo,
      ...(s.oneWayTo && s.oneWayTo.length ? { oneWayTo: s.oneWayTo } : {}),
      ...(typeof s.start === "number" ? { start: { slot: s.start } } : {}),
    })),
  };
};

/**
 * Import shim: accept EITHER a native `ProMapDef` (schemaVersion present — the
 * new export, round-trips) or a legacy `MapDoc` (older copies people saved),
 * coercing both back into the editor's internal `MapDoc`.
 */
export const toMapDoc = (raw: unknown): MapDoc => {
  const r = raw as Record<string, unknown>;
  const meta = (r.meta ?? {}) as Record<string, unknown>;
  if (typeof r.schemaVersion === "string") {
    const min = typeof meta.minPlayers === "number" ? meta.minPlayers : 2;
    const max = typeof meta.maxPlayers === "number" ? meta.maxPlayers : min;
    const players: number[] = [];
    for (let p = min; p <= max; p++) players.push(p);
    return {
      meta: {
        title: (meta.title as string) ?? "",
        imageUrl: (meta.imageUrl as string) ?? "",
        players: players.length ? players : [1, 2],
        source: (meta.source as string) ?? "",
        license: (meta.license as string) ?? "",
        ...(typeof meta.spaceDiameter === "number" ? { spaceDiameter: meta.spaceDiameter } : {}),
      },
      zones: (r.zones as Zone[]) ?? [],
      spaces: ((r.spaces as Record<string, unknown>[]) ?? []).map((s) => ({
        ...(s as unknown as Space),
        start:
          s.start && typeof s.start === "object"
            ? (s.start as { slot: number }).slot
            : (s.start as number | undefined),
      })),
    };
  }
  return raw as MapDoc; // already a legacy MapDoc
};

// ---------------------------------------------------------------------------
// Edges — derived from the spaces' adjacency/one-way lists. The editor treats an
// edge as a first-class, selectable object (a canonical unordered {u,v} pair),
// and reads/writes its state through these pure helpers so direction changes
// never go through the old click-cycle.
// ---------------------------------------------------------------------------

/** An edge as drawn: `type` distinguishes the undirected band from a directed hop. */
export type RenderEdge = { from: string; to: string; type: "two" | "one" };

/** Canonical selection handle for an edge: the two endpoints, u < v. */
export type EdgeRef = { u: string; v: string };

/** none = no edge · two = undirected · uv = u→v one-way · vu = v→u one-way */
export type EdgeState = "none" | "two" | "uv" | "vu";

export const edgeRef = (a: string, b: string): EdgeRef =>
  a < b ? { u: a, v: b } : { u: b, v: a };

export const sameEdge = (a: EdgeRef | undefined, b: EdgeRef | undefined): boolean =>
  !!a && !!b && a.u === b.u && a.v === b.v;

/** Every edge in the doc, each listed once (two-way keyed by from<to). */
export const edgesOf = (doc: MapDoc): RenderEdge[] => {
  const out: RenderEdge[] = [];
  for (const s of doc.spaces) {
    for (const a of s.adjacentTo) if (a > s.id) out.push({ from: s.id, to: a, type: "two" });
    for (const a of s.oneWayTo ?? []) out.push({ from: s.id, to: a, type: "one" });
  }
  return out;
};

export const edgeState = (doc: MapDoc, ref: EdgeRef): EdgeState => {
  const U = spaceById(doc, ref.u);
  const V = spaceById(doc, ref.v);
  if (!U || !V) return "none";
  if (U.adjacentTo.includes(ref.v) || V.adjacentTo.includes(ref.u)) return "two";
  if ((U.oneWayTo ?? []).includes(ref.v)) return "uv";
  if ((V.oneWayTo ?? []).includes(ref.u)) return "vu";
  return "none";
};

/** Drop any edge (either direction, two-way or one-way) between a and b. */
const stripEdge = (doc: MapDoc, a: string, b: string): MapDoc => ({
  ...doc,
  spaces: doc.spaces.map((s) => {
    if (s.id !== a && s.id !== b) return s;
    const other = s.id === a ? b : a;
    return {
      ...s,
      adjacentTo: s.adjacentTo.filter((x) => x !== other),
      oneWayTo: (s.oneWayTo ?? []).filter((x) => x !== other),
    };
  }),
});

const addAdjacent = (spaces: Space[], a: string, b: string): Space[] =>
  spaces.map((s) => {
    if (s.id === a && !s.adjacentTo.includes(b)) return { ...s, adjacentTo: [...s.adjacentTo, b] };
    if (s.id === b && !s.adjacentTo.includes(a)) return { ...s, adjacentTo: [...s.adjacentTo, a] };
    return s;
  });

/** Make a↔b an undirected edge (clears any prior one-way in either direction). */
export const setTwoWay = (doc: MapDoc, a: string, b: string): MapDoc => {
  const stripped = stripEdge(doc, a, b);
  return { ...stripped, spaces: addAdjacent(stripped.spaces, a, b) };
};

/** Make from→to a one-way edge (clears any two-way / reverse one-way first). */
export const setOneWay = (doc: MapDoc, from: string, to: string): MapDoc => {
  const stripped = stripEdge(doc, from, to);
  return {
    ...stripped,
    spaces: stripped.spaces.map((s) =>
      s.id === from ? { ...s, oneWayTo: [...(s.oneWayTo ?? []), to] } : s
    ),
  };
};

export const removeEdge = (doc: MapDoc, a: string, b: string): MapDoc => stripEdge(doc, a, b);

/** Apply an EdgeState to a {u,v} pair — the single write path the inspector uses. */
export const applyEdgeState = (doc: MapDoc, ref: EdgeRef, state: EdgeState): MapDoc => {
  switch (state) {
    case "two": return setTwoWay(doc, ref.u, ref.v);
    case "uv": return setOneWay(doc, ref.u, ref.v);
    case "vu": return setOneWay(doc, ref.v, ref.u);
    case "none": return removeEdge(doc, ref.u, ref.v);
  }
};

// ---------------------------------------------------------------------------
// Space mutations — all pure (doc in, doc out) so they compose with history.
// ---------------------------------------------------------------------------

/** Next free `sN` id (never collides with an existing space). */
export const nextSpaceId = (doc: MapDoc): string => {
  let id = `s${doc.spaces.length + 1}`;
  while (spaceById(doc, id)) id = `${id}x`;
  return id;
};

export const addSpace = (
  doc: MapDoc,
  id: string,
  x: number,
  y: number,
  zone?: string
): MapDoc => ({
  ...doc,
  spaces: [...doc.spaces, { id, x, y, zones: zone ? [zone] : [], adjacentTo: [] }],
});

export const moveSpace = (doc: MapDoc, id: string, x: number, y: number): MapDoc => ({
  ...doc,
  spaces: doc.spaces.map((s) => (s.id === id ? { ...s, x, y } : s)),
});

export const nudgeSpace = (doc: MapDoc, id: string, dx: number, dy: number): MapDoc => ({
  ...doc,
  spaces: doc.spaces.map((s) =>
    s.id === id
      ? { ...s, x: Math.min(1, Math.max(0, s.x + dx)), y: Math.min(1, Math.max(0, s.y + dy)) }
      : s
  ),
});

/** Delete a space and scrub every edge that pointed at it. */
export const deleteSpace = (doc: MapDoc, id: string): MapDoc => ({
  ...doc,
  spaces: doc.spaces
    .filter((s) => s.id !== id)
    .map((s) => ({
      ...s,
      adjacentTo: s.adjacentTo.filter((a) => a !== id),
      oneWayTo: (s.oneWayTo ?? []).filter((a) => a !== id),
    })),
});

export const toggleZone = (doc: MapDoc, id: string, zoneId: string): MapDoc => ({
  ...doc,
  spaces: doc.spaces.map((s) =>
    s.id !== id
      ? s
      : {
          ...s,
          zones: s.zones.includes(zoneId)
            ? s.zones.filter((z) => z !== zoneId)
            : [...s.zones, zoneId],
        }
  ),
});

export const setStart = (doc: MapDoc, id: string, slot: number | undefined): MapDoc => ({
  ...doc,
  spaces: doc.spaces.map((s) => (s.id === id ? { ...s, start: slot } : s)),
});

export const addZone = (doc: MapDoc): { doc: MapDoc; zoneId: string } => {
  const n = doc.zones.length;
  const zone: Zone = {
    id: `z${n + 1}`,
    color: ZONE_PRESETS[n % ZONE_PRESETS.length]!,
    label: `zone ${n + 1}`,
  };
  return { doc: { ...doc, zones: [...doc.zones, zone] }, zoneId: zone.id };
};

// ---------------------------------------------------------------------------
// Validation — same warnings the original editor surfaced.
// ---------------------------------------------------------------------------

export const validate = (doc: MapDoc): string[] => {
  const w: string[] = [];
  if (!doc.meta.title) w.push("meta.title is empty");
  if (!doc.meta.imageUrl) w.push("meta.imageUrl is empty");
  const starts = doc.spaces.filter((s) => s.start).map((s) => s.start);
  if (!starts.includes(1) || !starts.includes(2)) w.push("start spaces 1 and 2 not both marked");
  doc.spaces.forEach((s) => {
    if (s.zones.length === 0) w.push(`${s.id} has no zone`);
    if (s.adjacentTo.length === 0 && (s.oneWayTo ?? []).length === 0)
      w.push(`${s.id} is isolated (no adjacency)`);
    s.adjacentTo.forEach((a) => {
      const other = spaceById(doc, a);
      if (!other) w.push(`${s.id} points at missing space ${a}`);
      else if (!other.adjacentTo.includes(s.id)) w.push(`asymmetric edge ${s.id}->${a}`);
    });
    (s.oneWayTo ?? []).forEach((a) => {
      if (!spaceById(doc, a)) w.push(`${s.id} one-way to missing space ${a}`);
      if (s.adjacentTo.includes(a)) w.push(`${s.id}->${a} is BOTH two-way and one-way`);
    });
  });
  return w;
};
