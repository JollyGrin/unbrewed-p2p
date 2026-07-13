/**
 * Left sidebar for the map editor: metadata, the (now three) modes, the zone
 * palette, the global space-size slider, undo/redo, validation warnings, and
 * the import/export + GitHub-submit controls. Purely presentational — every
 * mutation is routed back up through the callbacks so the single history layer
 * owns all state.
 *
 * Text/slider controls use the transient begin/end pair so a whole edit session
 * (typing a title, dragging the slider) folds into ONE undo entry instead of
 * one per keystroke.
 */
import { Box, Button, Flex, Input, Text, Textarea } from "@chakra-ui/react";
import { mapSubmissionIssueUrl } from "@/lib/pro/mapIssue";
import type { MapDoc, MapItem, Zone } from "./model";
import { DEFAULT_DIAMETER, toMapDef } from "./model";
import type { EditorMode } from "./MapCanvas";
import { ItemsPanel } from "./ItemsPanel";
import { BTN, BTN_ON } from "./ui";

const MODE_HELP: Record<EditorMode, string> = {
  place: "click board = add · click space = select · drag = move · hover = delete ✕",
  connect: "click A then B (or drag A→B) = two-way edge · click an edge to set direction / delete",
  zone: "pick a zone below, then click spaces to toggle membership",
  passage: "click spaces to flag/unflag them as secret passages · ≥2 flagged spaces form one teleport network",
};

interface Props {
  doc: MapDoc;
  mode: EditorMode;
  setMode: (m: EditorMode) => void;
  activeZone?: string;
  setActiveZone: (z: string) => void;
  io: string;
  setIo: (s: string) => void;
  warnings: string[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  beginEdit: () => void;
  endEdit: () => void;
  setMetaField: (patch: Partial<MapDoc["meta"]>) => void;
  setZoneField: (zoneId: string, patch: Partial<Zone>) => void;
  addZone: () => void;
  addItem: (kind: MapItem["kind"]) => void;
  setItemField: (id: string, patch: Partial<MapItem>) => void;
  removeItem: (id: string) => void;
  doExport: () => void;
  doImport: () => void;
  doReset: () => void;
}

export const Toolbar = (props: Props) => {
  const {
    doc, mode, setMode, activeZone, setActiveZone, io, setIo, warnings,
    canUndo, canRedo, undo, redo, beginEdit, endEdit,
    setMetaField, setZoneField, addZone, addItem, setItemField, removeItem,
    doExport, doImport, doReset,
  } = props;

  const diameter = doc.meta.spaceDiameter ?? DEFAULT_DIAMETER;
  const edges = doc.spaces.reduce((n, s) => n + s.adjacentTo.length, 0) / 2;
  const oneWays = doc.spaces.reduce((n, s) => n + (s.oneWayTo?.length ?? 0), 0);

  return (
    <Flex flexDir="column" gap="0.6rem" w="20rem" p="0.9rem" overflowY="auto"
      bg="brand.surfaceDim" color="brand.parchment" fontSize="0.85rem">
      <Flex justifyContent="space-between" alignItems="center">
        <Text fontWeight={700}>map editor (dev)</Text>
        <Flex gap="0.25rem">
          <Button {...BTN} isDisabled={!canUndo} onClick={undo} title="undo (⌘Z)">↶</Button>
          <Button {...BTN} isDisabled={!canRedo} onClick={redo} title="redo (⇧⌘Z)">↷</Button>
        </Flex>
      </Flex>

      <Input size="sm" placeholder="map title" value={doc.meta.title}
        onFocus={beginEdit} onBlur={endEdit}
        onChange={(e) => setMetaField({ title: e.target.value })} />
      <Input size="sm" placeholder="image URL" value={doc.meta.imageUrl}
        onFocus={beginEdit} onBlur={endEdit}
        onChange={(e) => setMetaField({ imageUrl: e.target.value })} />
      <Input size="sm" placeholder="source (credit URL)" value={doc.meta.source}
        onFocus={beginEdit} onBlur={endEdit}
        onChange={(e) => setMetaField({ source: e.target.value })} />

      <Flex gap="0.25rem" flexWrap="wrap">
        {(["place", "connect", "zone", "passage"] as EditorMode[]).map((m) => (
          <Button key={m} {...(mode === m ? BTN_ON : BTN)} onClick={() => setMode(m)}>{m}</Button>
        ))}
      </Flex>
      <Text opacity={0.7} fontSize="0.75rem">{MODE_HELP[mode]}</Text>

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
              onFocus={beginEdit}
              onBlur={endEdit}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setZoneField(z.id, { color: e.target.value })}
              w="1.1rem" h="1.1rem" p="0" border="none" borderRadius="50%" bg={z.color} cursor="pointer"
              sx={{
                WebkitAppearance: "none",
                "::-webkit-color-swatch-wrapper": { padding: 0 },
                "::-webkit-color-swatch": { border: "none", borderRadius: "50%" },
              }}
            />
            <Input size="xs" w="4.5rem" variant="unstyled" value={z.label}
              onFocus={beginEdit} onBlur={endEdit}
              onChange={(e) => setZoneField(z.id, { label: e.target.value })} />
          </Flex>
        ))}
        <Button {...BTN} onClick={addZone}>+ zone</Button>
      </Flex>

      <ItemsPanel
        items={doc.items ?? []}
        addItem={addItem}
        setItemField={setItemField}
        removeItem={removeItem}
        beginEdit={beginEdit}
        endEdit={endEdit}
      />

      <Flex alignItems="center" gap="0.5rem">
        <Text fontSize="0.75rem" whiteSpace="nowrap">circle size</Text>
        <input
          type="range" min={0.008} max={0.09} step={0.001} value={diameter}
          onFocus={beginEdit} onBlur={endEdit}
          onChange={(e) => setMetaField({ spaceDiameter: Number(e.target.value) })}
          style={{ flex: 1, accentColor: "#E0A82E" }}
        />
        <Text fontSize="0.7rem" opacity={0.6} w="2.6rem" textAlign="right">
          {(diameter * 100).toFixed(1)}%
        </Text>
      </Flex>

      <Text fontSize="0.75rem">
        spaces: {doc.spaces.length} · edges: {edges} · one-way: {oneWays}
      </Text>

      {warnings.length > 0 && (
        <Box bg="rgba(255,99,71,0.15)" borderRadius="0.3rem" p="0.5rem" fontSize="0.7rem">
          {warnings.slice(0, 12).map((w, i) => <Text key={i}>⚠ {w}</Text>)}
          {warnings.length > 12 && <Text>…and {warnings.length - 12} more</Text>}
        </Box>
      )}

      <Flex gap="0.3rem">
        <Button {...BTN} onClick={doExport}>export → box</Button>
        <Button {...BTN} onClick={doImport}>import ← box</Button>
        <Button size="xs" colorScheme="red" variant="outline" onClick={doReset}>reset</Button>
      </Flex>
      <Textarea value={io} onChange={(e) => setIo(e.target.value)} fontSize="0.65rem"
        fontFamily="monospace" rows={12} placeholder="export/import JSON" bg="rgba(0,0,0,0.25)" />

      <Button
        {...BTN}
        as="a"
        href={mapSubmissionIssueUrl(toMapDef(doc), JSON.stringify(toMapDef(doc), null, 2))}
        target="_blank"
        rel="noopener noreferrer"
        isDisabled={doc.spaces.length === 0}
      >
        submit map to unbrewed →
      </Button>
    </Flex>
  );
};
