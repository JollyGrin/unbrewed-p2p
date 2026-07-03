/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import type { GetServerSideProps } from "next";
import {
  Box,
  Button,
  Flex,
  Input,
  Text,
  Textarea,
} from "@chakra-ui/react";

/**
 * DEV-ONLY map annotation editor (docs/pro/tasks/T-009).
 * Loads a board image, lets a human place spaces, draw adjacency edges,
 * paint zones, and mark start slots; exports scripted-map JSON per
 * docs/pro/05-scripted-maps.md §3. 404s in production builds.
 */

type Zone = { id: string; color: string; label: string };
type Space = {
  id: string;
  x: number; // normalized 0-1 of image width
  y: number; // normalized 0-1 of image height
  zones: string[];
  adjacentTo: string[]; // symmetric edges
  oneWayTo?: string[]; // directed edges (e.g. Mended Drum's stairs drop)
  start?: number; // player slot 1-4
};
type MapDoc = {
  meta: {
    title: string;
    imageUrl: string;
    players: number[];
    source: string;
    license: string;
  };
  zones: Zone[];
  spaces: Space[];
};

type Mode = "space" | "connect" | "zone" | "start" | "delete";

const ZONE_PRESETS = [
  "#3182ce", "#e53e3e", "#38a169", "#d69e2e", "#805ad5",
  "#dd6b20", "#319795", "#b83280", "#718096", "#744210",
];

const STORAGE_KEY = "unbrewed-map-editor-draft";

// dark-sidebar button styling (Chakra's default gray is unreadable here)
const BTN = {
  size: "xs" as const,
  bg: "whiteAlpha.200",
  color: "brand.parchment",
  _hover: { bg: "whiteAlpha.400" },
  _active: { bg: "whiteAlpha.500" },
};
const BTN_ON = {
  ...BTN,
  bg: "brand.accent",
  color: "brand.surfaceDim",
  _hover: { bg: "brand.accentDeep" },
  _active: { bg: "brand.accentDeep" },
};

const emptyDoc = (): MapDoc => ({
  meta: { title: "", imageUrl: "", players: [1, 2], source: "", license: "community map — credit the author" },
  zones: [],
  spaces: [],
});

const MapEditor = () => {
  const [doc, setDoc] = useState<MapDoc>(emptyDoc);
  const [mode, setMode] = useState<Mode>("space");
  const [selected, setSelected] = useState<string>(); // space id (also the connect-from anchor)
  const [activeZone, setActiveZone] = useState<string>();
  const [io, setIo] = useState(""); // import/export textarea
  const [drag, setDrag] = useState<{ id: string; moved: boolean }>();
  const imgRef = useRef<HTMLImageElement>(null);

  // draft persistence
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { setDoc(JSON.parse(raw)); } catch { /* ignore corrupt draft */ }
    }
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  }, [doc]);

  const relPoint = useCallback((e: { clientX: number; clientY: number }) => {
    const r = imgRef.current?.getBoundingClientRect();
    if (!r) return undefined;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }, []);

  const spaceById = (id: string) => doc.spaces.find((s) => s.id === id);

  const onCanvasClick = (e: React.MouseEvent) => {
    if (mode !== "space" || drag?.moved) return;
    const p = relPoint(e);
    if (!p) return;
    const n = doc.spaces.length + 1;
    let id = `s${n}`;
    while (spaceById(id)) id = `${id}x`;
    setDoc({ ...doc, spaces: [...doc.spaces, { id, ...p, zones: activeZone ? [activeZone] : [], adjacentTo: [] }] });
    setSelected(id);
  };

  const onSpaceClick = (id: string) => {
    if (drag?.moved) return;
    if (mode === "space") setSelected(id);
    if (mode === "delete") {
      setDoc({
        ...doc,
        spaces: doc.spaces
          .filter((s) => s.id !== id)
          .map((s) => ({
            ...s,
            adjacentTo: s.adjacentTo.filter((a) => a !== id),
            oneWayTo: (s.oneWayTo ?? []).filter((a) => a !== id),
          })),
      });
      if (selected === id) setSelected(undefined);
    }
    if (mode === "connect") {
      if (!selected || selected === id) return setSelected(id);
      // cycle A->B: none -> two-way -> one-way A->B -> one-way B->A -> none
      const a = selected;
      const b = id;
      const A = spaceById(a)!;
      const B = spaceById(b)!;
      const twoWay = A.adjacentTo.includes(b);
      const aToB = (A.oneWayTo ?? []).includes(b);
      const bToA = (B.oneWayTo ?? []).includes(a);
      const strip = (s: Space): Space => {
        const other = s.id === a ? b : a;
        return {
          ...s,
          adjacentTo: s.adjacentTo.filter((x) => x !== other),
          oneWayTo: (s.oneWayTo ?? []).filter((x) => x !== other),
        };
      };
      setDoc({
        ...doc,
        spaces: doc.spaces.map((s) => {
          if (s.id !== a && s.id !== b) return s;
          const base = strip(s);
          if (!twoWay && !aToB && !bToA) {
            // none -> two-way
            return { ...base, adjacentTo: [...base.adjacentTo, s.id === a ? b : a] };
          }
          if (twoWay) {
            // two-way -> one-way a->b
            return s.id === a ? { ...base, oneWayTo: [...base.oneWayTo!, b] } : base;
          }
          if (aToB) {
            // one-way a->b -> one-way b->a
            return s.id === b ? { ...base, oneWayTo: [...base.oneWayTo!, a] } : base;
          }
          return base; // one-way b->a -> none
        }),
      });
      setSelected(id); // chain: next click connects from here
    }
    if (mode === "zone" && activeZone) {
      setDoc({
        ...doc,
        spaces: doc.spaces.map((s) =>
          s.id !== id ? s : {
            ...s,
            zones: s.zones.includes(activeZone)
              ? s.zones.filter((z) => z !== activeZone)
              : [...s.zones, activeZone],
          }
        ),
      });
    }
    if (mode === "start") {
      setDoc({
        ...doc,
        spaces: doc.spaces.map((s) => {
          if (s.id !== id) return s;
          const next = ((s.start ?? 0) + 1) as number;
          return { ...s, start: next > 4 ? undefined : next };
        }),
      });
    }
  };

  // dragging (space mode only)
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || mode !== "space") return;
    const p = relPoint(e);
    if (!p) return;
    setDrag({ ...drag, moved: true });
    setDoc({
      ...doc,
      spaces: doc.spaces.map((s) => (s.id === drag.id ? { ...s, ...p } : s)),
    });
  };

  const addZone = () => {
    const n = doc.zones.length;
    const zone: Zone = { id: `z${n + 1}`, color: ZONE_PRESETS[n % ZONE_PRESETS.length]!, label: `zone ${n + 1}` };
    setDoc({ ...doc, zones: [...doc.zones, zone] });
    setActiveZone(zone.id);
  };

  const validate = (): string[] => {
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
        const other = spaceById(a);
        if (!other) w.push(`${s.id} points at missing space ${a}`);
        else if (!other.adjacentTo.includes(s.id)) w.push(`asymmetric edge ${s.id}->${a}`);
      });
      (s.oneWayTo ?? []).forEach((a) => {
        if (!spaceById(a)) w.push(`${s.id} one-way to missing space ${a}`);
        if (s.adjacentTo.includes(a)) w.push(`${s.id}->${a} is BOTH two-way and one-way`);
      });
    });
    return w;
  };

  const warnings = validate();

  return (
    <Flex h="100vh" fontFamily="SpaceGrotesk">
      {/* sidebar */}
      <Flex flexDir="column" gap="0.6rem" w="20rem" p="0.9rem" overflowY="auto" bg="brand.surfaceDim" color="brand.parchment" fontSize="0.85rem">
        <Text fontWeight={700}>map editor (dev)</Text>
        <Input size="sm" placeholder="map title" value={doc.meta.title}
          onChange={(e) => setDoc({ ...doc, meta: { ...doc.meta, title: e.target.value } })} />
        <Input size="sm" placeholder="image URL" value={doc.meta.imageUrl}
          onChange={(e) => setDoc({ ...doc, meta: { ...doc.meta, imageUrl: e.target.value } })} />
        <Input size="sm" placeholder="source (credit URL)" value={doc.meta.source}
          onChange={(e) => setDoc({ ...doc, meta: { ...doc.meta, source: e.target.value } })} />

        <Flex gap="0.25rem" flexWrap="wrap">
          {(["space", "connect", "zone", "start", "delete"] as Mode[]).map((m) => (
            <Button key={m} {...(mode === m ? BTN_ON : BTN)}
              onClick={() => { setMode(m); setSelected(undefined); }}>{m}</Button>
          ))}
        </Flex>
        <Text opacity={0.7} fontSize="0.75rem">
          {mode === "space" && "click canvas = add · click space = select · drag = move"}
          {mode === "connect" && "click A then B, repeat to cycle: two-way → one-way A→B (orange dot = destination) → one-way B→A → none"}
          {mode === "zone" && "pick a zone below, then click spaces to toggle membership"}
          {mode === "start" && "click a space to cycle start slot 1→2→3→4→none"}
          {mode === "delete" && "click a space to remove it"}
        </Text>

        <Flex alignItems="center" gap="0.4rem" flexWrap="wrap">
          {doc.zones.map((z) => (
            <Flex key={z.id} alignItems="center" gap="0.2rem"
              border={activeZone === z.id ? "2px solid white" : "2px solid transparent"}
              borderRadius="0.3rem" p="0.15rem" cursor="pointer" onClick={() => setActiveZone(z.id)}>
              <Box
                as="input"
                type="color"
                value={z.color}
                title="change zone color"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDoc({ ...doc, zones: doc.zones.map((zz) => zz.id === z.id ? { ...zz, color: e.target.value } : zz) })
                }
                w="1.1rem"
                h="1.1rem"
                p="0"
                border="none"
                borderRadius="50%"
                bg={z.color}
                cursor="pointer"
                sx={{
                  WebkitAppearance: "none",
                  "::-webkit-color-swatch-wrapper": { padding: 0 },
                  "::-webkit-color-swatch": { border: "none", borderRadius: "50%" },
                }}
              />
              <Input size="xs" w="4.5rem" variant="unstyled" value={z.label}
                onChange={(e) => setDoc({ ...doc, zones: doc.zones.map((zz) => zz.id === z.id ? { ...zz, label: e.target.value } : zz) })} />
            </Flex>
          ))}
          <Button {...BTN} onClick={addZone}>+ zone</Button>
        </Flex>

        <Text fontSize="0.75rem">spaces: {doc.spaces.length} · edges:{" "}
          {doc.spaces.reduce((n, s) => n + s.adjacentTo.length, 0) / 2} · one-way:{" "}
          {doc.spaces.reduce((n, s) => n + (s.oneWayTo?.length ?? 0), 0)}</Text>

        {warnings.length > 0 && (
          <Box bg="rgba(255,99,71,0.15)" borderRadius="0.3rem" p="0.5rem" fontSize="0.7rem">
            {warnings.slice(0, 12).map((w, i) => <Text key={i}>⚠ {w}</Text>)}
            {warnings.length > 12 && <Text>…and {warnings.length - 12} more</Text>}
          </Box>
        )}

        <Flex gap="0.3rem">
          <Button {...BTN} onClick={() => setIo(JSON.stringify(doc, null, 2))}>export → box</Button>
          <Button {...BTN} onClick={() => { try { setDoc(JSON.parse(io)); } catch { alert("invalid JSON"); } }}>import ← box</Button>
          <Button size="xs" colorScheme="red" variant="outline"
            onClick={() => { if (confirm("clear draft?")) { setDoc(emptyDoc()); setIo(""); } }}>reset</Button>
        </Flex>
        <Textarea value={io} onChange={(e) => setIo(e.target.value)} fontSize="0.65rem"
          fontFamily="monospace" rows={12} placeholder="export/import JSON" bg="rgba(0,0,0,0.25)" />
      </Flex>

      {/* canvas */}
      <Box flex="1" overflow="auto" bg="#1b1020"
        onPointerMove={onPointerMove}
        onPointerUp={() => setDrag(undefined)}>
        {doc.meta.imageUrl ? (
          <Box position="relative" display="inline-block" onClick={onCanvasClick}>
            <img ref={imgRef} src={doc.meta.imageUrl} alt="board" draggable={false}
              style={{ maxWidth: "none", width: "1400px", userSelect: "none" }} />
            {/* edges */}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
              {doc.spaces.flatMap((s) =>
                s.adjacentTo
                  .filter((a) => a > s.id) // draw each edge once
                  .map((a) => {
                    const o = spaceById(a);
                    return o ? (
                      <line key={`${s.id}-${a}`} x1={s.x * 100} y1={s.y * 100} x2={o.x * 100} y2={o.y * 100}
                        stroke="#00e5ff" strokeWidth={3} vectorEffect="non-scaling-stroke" opacity={0.9} />
                    ) : null;
                  })
              )}
              {/* one-way edges: orange, dot marks the DESTINATION end */}
              {doc.spaces.flatMap((s) =>
                (s.oneWayTo ?? []).map((a) => {
                  const o = spaceById(a);
                  if (!o) return null;
                  const dx = s.x + (o.x - s.x) * 0.78;
                  const dy = s.y + (o.y - s.y) * 0.78;
                  return (
                    <g key={`ow-${s.id}-${a}`}>
                      <line x1={s.x * 100} y1={s.y * 100} x2={o.x * 100} y2={o.y * 100}
                        stroke="#ff9f1c" strokeWidth={3} vectorEffect="non-scaling-stroke" opacity={0.95} strokeDasharray="6 3" />
                      <circle cx={dx * 100} cy={dy * 100} r={0.55} fill="#ff9f1c" />
                    </g>
                  );
                })
              )}
            </svg>
            {/* spaces */}
            {doc.spaces.map((s) => {
              const cols = s.zones.map((zid) => doc.zones.find((z) => z.id === zid)?.color ?? "#999");
              const bg =
                cols.length === 0 ? "rgba(255,255,255,0.25)"
                : cols.length === 1 ? cols[0]
                : `conic-gradient(${cols.map((c, i) => `${c} ${(i / cols.length) * 360}deg ${((i + 1) / cols.length) * 360}deg`).join(", ")})`;
              return (
                <Box key={s.id}
                  onPointerDown={(e) => { e.stopPropagation(); setDrag({ id: s.id, moved: false }); }}
                  onClick={(e) => { e.stopPropagation(); onSpaceClick(s.id); }}
                  position="absolute" left={`${s.x * 100}%`} top={`${s.y * 100}%`}
                  transform="translate(-50%, -50%)"
                  w="30px" h="30px" borderRadius="50%"
                  border="3px solid"
                  borderColor={selected === s.id ? "#00e5ff" : "rgba(0,0,0,0.85)"}
                  boxShadow={selected === s.id ? "0 0 10px #00e5ff" : "0 0 4px rgba(0,0,0,0.6)"}
                  cursor={mode === "space" ? "grab" : "pointer"}
                  sx={{ background: bg }}
                  title={`${s.id} zones:[${s.zones.join(",")}]`}
                >
                  {s.start && (
                    <Flex position="absolute" top="-10px" right="-10px" w="16px" h="16px"
                      borderRadius="50%" bg="brand.accent" color="black" fontSize="0.6rem"
                      fontWeight={700} alignItems="center" justifyContent="center">
                      {s.start}
                    </Flex>
                  )}
                </Box>
              );
            })}
          </Box>
        ) : (
          <Flex h="100%" alignItems="center" justifyContent="center" color="brand.parchment" opacity={0.5}>
            paste a board image URL in the sidebar to begin
          </Flex>
        )}
      </Box>
    </Flex>
  );
};

// hard 404 in production builds — this page is an internal tool
export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.NODE_ENV === "production") return { notFound: true };
  return { props: {} };
};

export default MapEditor;
