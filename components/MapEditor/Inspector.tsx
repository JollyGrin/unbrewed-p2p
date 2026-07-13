/**
 * Right-hand inspector for the map editor. Shows the currently selected space
 * (id, position, zone membership, start slot, delete) OR the currently selected
 * edge (direction picker + delete). This is the panel that shrinks the old mode
 * system — start slots and deletion live here instead of being their own tools.
 *
 * The space panel leaves a clearly-marked EXTENSION POINT for the in-flight
 * engine features (#151 secret passages, #152 battlefield items): their
 * per-space fields drop into `<SpaceExtensionPoint>` as a small follow-up.
 */
import { Box, Button, Checkbox, Flex, Select, Text } from "@chakra-ui/react";
import type { EdgeRef, EdgeState, MapDoc, Zone } from "./model";
import { edgeState, spaceById } from "./model";
import { BTN, BTN_ON } from "./ui";

const NUDGE = 0.005; // 0.5% of image dimension per arrow tap

export interface InspectorActions {
  deleteSpace: (id: string) => void;
  toggleZone: (id: string, zoneId: string) => void;
  setStart: (id: string, slot: number | undefined) => void;
  nudge: (id: string, dx: number, dy: number) => void;
  setEdge: (ref: EdgeRef, state: EdgeState) => void;
  setItem: (id: string, itemId: string | undefined) => void;
  setPassage: (id: string, on: boolean) => void;
}

interface Props {
  doc: MapDoc;
  zones: Zone[];
  selectedSpaceId?: string;
  selectedEdge?: EdgeRef;
  actions: InspectorActions;
  onClose: () => void;
}

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Box>
    <Text fontSize="0.65rem" opacity={0.6} letterSpacing="0.08em" textTransform="uppercase" mb="0.25rem">
      {label}
    </Text>
    {children}
  </Box>
);

/** Per-space engine #156/#157 fields: a battlefield-item assignment and the
 *  secret-passage flag. This is the extension point #269 marked. */
const SpaceExtensionPoint = ({
  space,
  doc,
  actions,
}: {
  space: { id: string; item?: string; passage?: boolean };
  doc: MapDoc;
  actions: InspectorActions;
}) => (
  <Box borderTop="1px dashed" borderColor="whiteAlpha.300" pt="0.5rem" display="flex" flexDir="column" gap="0.6rem">
    <Section label="battlefield item">
      <Select
        size="sm"
        value={space.item ?? ""}
        onChange={(e) => actions.setItem(space.id, e.target.value || undefined)}
        bg="rgba(0,0,0,0.25)"
      >
        <option value="">none</option>
        {(doc.items ?? []).map((it) => (
          <option key={it.id} value={it.id}>
            {it.label} ({it.kind})
          </option>
        ))}
      </Select>
      {(doc.items ?? []).length === 0 && (
        <Text fontSize="0.62rem" opacity={0.6} mt="0.2rem">
          define items in the sidebar’s Items panel first
        </Text>
      )}
    </Section>
    <Section label="secret passage">
      <Checkbox
        isChecked={!!space.passage}
        onChange={(e) => actions.setPassage(space.id, e.target.checked)}
        size="sm"
      >
        <Text fontSize="0.72rem">secret passage space</Text>
      </Checkbox>
    </Section>
  </Box>
);

const EdgeInspector = ({
  edge,
  doc,
  actions,
  onClose,
}: {
  edge: EdgeRef;
  doc: MapDoc;
  actions: InspectorActions;
  onClose: () => void;
}) => {
  const state = edgeState(doc, edge);
  const opt = (label: string, s: EdgeState) => (
    <Button key={s} {...(state === s ? BTN_ON : BTN)} onClick={() => actions.setEdge(edge, s)} justifyContent="flex-start">
      {label}
    </Button>
  );
  return (
    <Flex flexDir="column" gap="0.6rem">
      <Flex justifyContent="space-between" alignItems="center">
        <Text fontWeight={700}>edge</Text>
        <Button {...BTN} onClick={onClose}>✕</Button>
      </Flex>
      <Text fontSize="0.8rem" fontFamily="monospace">
        {edge.u} — {edge.v}
      </Text>
      <Section label="direction">
        <Flex flexDir="column" gap="0.3rem">
          {opt("two-way ↔", "two")}
          {opt(`one-way  ${edge.u} → ${edge.v}`, "uv")}
          {opt(`one-way  ${edge.v} → ${edge.u}`, "vu")}
        </Flex>
      </Section>
      <Button size="xs" colorScheme="red" variant="outline" onClick={() => actions.setEdge(edge, "none")}>
        delete edge
      </Button>
    </Flex>
  );
};

const SpaceInspector = ({
  id,
  doc,
  zones,
  actions,
  onClose,
}: {
  id: string;
  doc: MapDoc;
  zones: Zone[];
  actions: InspectorActions;
  onClose: () => void;
}) => {
  const s = spaceById(doc, id);
  if (!s) return null;
  const startSlots: (number | undefined)[] = [undefined, 1, 2, 3, 4];
  return (
    <Flex flexDir="column" gap="0.7rem">
      <Flex justifyContent="space-between" alignItems="center">
        <Text fontWeight={700}>space</Text>
        <Button {...BTN} onClick={onClose}>✕</Button>
      </Flex>
      <Text fontSize="0.9rem" fontFamily="monospace" fontWeight={700} color="brand.accent">
        {s.id}
      </Text>

      <Section label={`position  ${(s.x * 100).toFixed(1)}% , ${(s.y * 100).toFixed(1)}%`}>
        <Box display="grid" gridTemplateColumns="repeat(3, 1fr)" gap="0.2rem" w="7rem">
          <Box />
          <Button {...BTN} onClick={() => actions.nudge(id, 0, -NUDGE)} aria-label="nudge up">↑</Button>
          <Box />
          <Button {...BTN} onClick={() => actions.nudge(id, -NUDGE, 0)} aria-label="nudge left">←</Button>
          <Button {...BTN} onClick={() => actions.nudge(id, 0, NUDGE)} aria-label="nudge down">↓</Button>
          <Button {...BTN} onClick={() => actions.nudge(id, NUDGE, 0)} aria-label="nudge right">→</Button>
        </Box>
      </Section>

      <Section label="zones">
        {zones.length === 0 ? (
          <Text fontSize="0.7rem" opacity={0.6}>no zones yet — add one in the toolbar</Text>
        ) : (
          <Flex flexDir="column" gap="0.2rem">
            {zones.map((z) => {
              const on = s.zones.includes(z.id);
              return (
                <Flex
                  key={z.id}
                  as="button"
                  alignItems="center"
                  gap="0.4rem"
                  onClick={() => actions.toggleZone(id, z.id)}
                  bg={on ? "whiteAlpha.300" : "transparent"}
                  _hover={{ bg: "whiteAlpha.200" }}
                  borderRadius="0.3rem"
                  px="0.35rem"
                  py="0.2rem"
                  textAlign="left"
                >
                  <Box w="0.9rem" h="0.9rem" borderRadius="50%" bg={z.color}
                    border={on ? "2px solid white" : "2px solid transparent"} flexShrink={0} />
                  <Text fontSize="0.72rem">{z.label}</Text>
                  <Text fontSize="0.72rem" ml="auto" opacity={0.7}>{on ? "✓" : ""}</Text>
                </Flex>
              );
            })}
          </Flex>
        )}
      </Section>

      <Section label="start slot">
        <Flex gap="0.25rem" flexWrap="wrap">
          {startSlots.map((slot) => (
            <Button
              key={slot ?? "none"}
              {...(s.start === slot ? BTN_ON : BTN)}
              onClick={() => actions.setStart(id, slot)}
            >
              {slot ?? "none"}
            </Button>
          ))}
        </Flex>
      </Section>

      <SpaceExtensionPoint space={s} doc={doc} actions={actions} />

      <Button size="xs" colorScheme="red" variant="outline" onClick={() => actions.deleteSpace(id)}>
        delete space
      </Button>
    </Flex>
  );
};

export const Inspector = ({ doc, zones, selectedSpaceId, selectedEdge, actions, onClose }: Props) => {
  return (
    <Flex
      flexDir="column"
      w="16rem"
      p="0.9rem"
      overflowY="auto"
      bg="brand.surfaceDim"
      color="brand.parchment"
      fontSize="0.85rem"
      borderLeft="1px solid"
      borderColor="whiteAlpha.200"
    >
      {selectedEdge ? (
        <EdgeInspector edge={selectedEdge} doc={doc} actions={actions} onClose={onClose} />
      ) : selectedSpaceId ? (
        <SpaceInspector id={selectedSpaceId} doc={doc} zones={zones} actions={actions} onClose={onClose} />
      ) : (
        <Flex flex="1" alignItems="center" justifyContent="center" textAlign="center" opacity={0.5}>
          <Text fontSize="0.75rem">
            select a space or an edge to edit it here
          </Text>
        </Flex>
      )}
    </Flex>
  );
};
