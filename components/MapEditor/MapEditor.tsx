/**
 * DEV-ONLY map annotation editor (docs/pro/tasks/T-009), refreshed for
 * unbrewed-p2p-267: direct edge editing, undo/redo, zoom/pan, and a space/edge
 * inspector that shrinks the old five-tool mode system down to three.
 *
 * Architecture: a single immutable `doc` (MapDoc) behind a history layer
 * (useMapHistory). Every mutation is a pure model.ts function committed through
 * that layer, so undo/redo is total and cheap. This file is the orchestrator —
 * canvas, toolbar, and inspector are dumb-ish views wired to these callbacks.
 *
 * The exported JSON (ProMapDef) and the localStorage draft shape are UNCHANGED
 * from the original single-file editor, so old drafts load and round-trips diff
 * clean.
 */
import { useCallback, useEffect, useState } from "react";
import { Flex } from "@chakra-ui/react";
import { useMapHistory } from "./useMapHistory";
import {
  MapDoc, MapItem, Zone, EdgeRef, EdgeState,
  STORAGE_KEY, DEFAULT_DIAMETER, emptyDoc, toMapDef, toMapDoc, validate,
  addSpace, moveSpace, deleteSpace, toggleZone, setStart, nudgeSpace,
  nextSpaceId, setTwoWay, applyEdgeState, edgeRef, edgeState, addZone as addZoneFn,
  addItem as addItemFn, setItemField, removeItem, setSpaceItem, setPassage,
} from "./model";
import { MapCanvas, EditorMode } from "./MapCanvas";
import { Toolbar } from "./Toolbar";
import { Inspector, InspectorActions } from "./Inspector";

export const MapEditor = () => {
  const history = useMapHistory<MapDoc>(emptyDoc());
  const doc = history.present;

  const [mode, setModeState] = useState<EditorMode>("place");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>();
  const [selectedEdge, setSelectedEdge] = useState<EdgeRef>();
  const [activeZone, setActiveZone] = useState<string>();
  const [io, setIo] = useState("");
  // Gate autosave until the mount-time draft load has run: otherwise the very
  // first `[doc]` autosave (still holding the empty initial doc) races ahead of
  // the load and clobbers a saved draft with an empty map.
  const [ready, setReady] = useState(false);

  // --- draft persistence (same key + shape as the original editor) ---------
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { history.load(toMapDoc(JSON.parse(raw))); } catch { /* ignore corrupt draft */ }
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  }, [doc, ready]);

  // --- keyboard undo/redo (skipped while typing in a form field) ------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);

  // --- selection (space and edge are mutually exclusive in the inspector) ---
  const selectSpace = useCallback((id: string) => {
    setSelectedSpaceId(id);
    setSelectedEdge(undefined);
  }, []);
  const selectEdge = useCallback((ref: EdgeRef) => {
    setSelectedEdge(ref);
    setSelectedSpaceId(undefined);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedSpaceId(undefined);
    setSelectedEdge(undefined);
  }, []);

  const setMode = useCallback((m: EditorMode) => {
    setModeState(m);
    clearSelection();
  }, [clearSelection]);

  // --- canvas actions (memoized: MapCanvas re-attaches window listeners on
  //     these, so stable identities keep it from churning) -------------------
  const { commit, update, beginTransient, endTransient } = history;

  const onPlace = useCallback((x: number, y: number) => {
    const id = nextSpaceId(doc);
    commit(addSpace(doc, id, x, y, activeZone));
    selectSpace(id);
  }, [doc, activeZone, commit, selectSpace]);

  const onMove = useCallback((id: string, x: number, y: number) => {
    update((d) => moveSpace(d, id, x, y));
  }, [update]);

  const onConnect = useCallback((a: string, b: string) => {
    const ref = edgeRef(a, b);
    if (edgeState(doc, ref) === "two") { selectEdge(ref); return; } // no-op, just select
    commit((d) => setTwoWay(d, a, b));
    selectEdge(ref);
  }, [doc, commit, selectEdge]);

  const onToggleZonePaint = useCallback((id: string) => {
    if (!activeZone) return;
    commit((d) => toggleZone(d, id, activeZone));
  }, [activeZone, commit]);

  const onDeleteSpace = useCallback((id: string) => {
    commit((d) => deleteSpace(d, id));
    setSelectedSpaceId((cur) => (cur === id ? undefined : cur));
  }, [commit]);

  // --- inspector actions ----------------------------------------------------
  const inspectorActions: InspectorActions = {
    deleteSpace: onDeleteSpace,
    toggleZone: (id, zoneId) => commit((d) => toggleZone(d, id, zoneId)),
    setStart: (id, slot) => commit((d) => setStart(d, id, slot)),
    nudge: (id, dx, dy) => commit((d) => nudgeSpace(d, id, dx, dy)),
    setEdge: (ref: EdgeRef, state: EdgeState) => {
      commit((d) => applyEdgeState(d, ref, state));
      if (state === "none") setSelectedEdge(undefined);
    },
    setItem: (id, itemId) => commit((d) => setSpaceItem(d, id, itemId)),
    setPassage: (id, on) => commit((d) => setPassage(d, id, on)),
  };

  // --- battlefield-item panel actions (engine #157) -------------------------
  const addItem = useCallback((kind: MapItem["kind"]) => {
    commit((d) => addItemFn(d, kind).doc);
  }, [commit]);
  const setItemFieldCb = useCallback((id: string, patch: Partial<MapItem>) => {
    update((d) => setItemField(d, id, patch));
  }, [update]);
  const removeItemCb = useCallback((id: string) => {
    commit((d) => removeItem(d, id));
  }, [commit]);

  // --- toolbar actions ------------------------------------------------------
  const setMetaField = useCallback((patch: Partial<MapDoc["meta"]>) => {
    update((d) => ({ ...d, meta: { ...d.meta, ...patch } }));
  }, [update]);

  const setZoneField = useCallback((zoneId: string, patch: Partial<Zone>) => {
    update((d) => ({ ...d, zones: d.zones.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)) }));
  }, [update]);

  const addZone = useCallback(() => {
    const { doc: nd, zoneId } = addZoneFn(doc);
    commit(nd);
    setActiveZone(zoneId);
  }, [doc, commit]);

  const doExport = useCallback(() => {
    setIo(JSON.stringify(toMapDef(doc), null, 2));
  }, [doc]);

  const doImport = useCallback(() => {
    try {
      commit(toMapDoc(JSON.parse(io)));
      clearSelection();
    } catch {
      alert("invalid JSON");
    }
  }, [io, commit, clearSelection]);

  const doReset = useCallback(() => {
    // Reset is undoable (committed), so a misfire is one ⌘Z away — no more
    // "the only recovery is a full reset" trap the old delete tool had.
    if (confirm("clear the draft? (this is undoable with ⌘Z)")) {
      commit(emptyDoc());
      setIo("");
      clearSelection();
    }
  }, [commit, clearSelection]);

  const warnings = validate(doc);

  return (
    <Flex h="100vh" fontFamily="SpaceGrotesk">
      <Toolbar
        doc={doc}
        mode={mode}
        setMode={setMode}
        activeZone={activeZone}
        setActiveZone={setActiveZone}
        io={io}
        setIo={setIo}
        warnings={warnings}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        undo={history.undo}
        redo={history.redo}
        beginEdit={beginTransient}
        endEdit={endTransient}
        setMetaField={setMetaField}
        setZoneField={setZoneField}
        addZone={addZone}
        addItem={addItem}
        setItemField={setItemFieldCb}
        removeItem={removeItemCb}
        doExport={doExport}
        doImport={doImport}
        doReset={doReset}
      />

      <MapCanvas
        doc={doc}
        zones={doc.zones}
        spaceDiameter={doc.meta.spaceDiameter ?? DEFAULT_DIAMETER}
        mode={mode}
        selectedSpaceId={selectedSpaceId}
        selectedEdge={selectedEdge}
        onPlace={onPlace}
        onSelectSpace={selectSpace}
        onSelectEdge={selectEdge}
        onClearSelection={clearSelection}
        onConnect={onConnect}
        onToggleZone={onToggleZonePaint}
        onDeleteSpace={onDeleteSpace}
        onMoveStart={beginTransient}
        onMove={onMove}
        onMoveEnd={endTransient}
      />

      <Inspector
        doc={doc}
        zones={doc.zones}
        selectedSpaceId={selectedSpaceId}
        selectedEdge={selectedEdge}
        actions={inspectorActions}
        onClose={clearSelection}
      />
    </Flex>
  );
};
