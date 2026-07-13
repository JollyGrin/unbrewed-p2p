/**
 * Map-level battlefield-items editor (engine #157 / protocol v17). Add/remove
 * `MapItem`s and edit their fields: label, and either a combat `value` (≥1) or a
 * scheme `ops` JSON body. Per the ticket there is NO ops-builder in v1 — scheme
 * ops are a raw JSON textarea. Assigning an item to a space happens in the space
 * inspector; this panel only defines the items.
 *
 * Purely presentational: every mutation is routed up through the callbacks so the
 * single history layer owns all state. Text edits fold into ONE undo entry via the
 * begin/end transient pair, matching the rest of the toolbar.
 */
import { useEffect, useState } from "react";
import { Box, Button, Flex, Input, Tag, Text, Textarea } from "@chakra-ui/react";
import type { Json } from "@/lib/pro/protocol";
import type { MapItem } from "./model";
import { BTN } from "./ui";

interface Props {
  items: MapItem[];
  addItem: (kind: MapItem["kind"]) => void;
  setItemField: (id: string, patch: Partial<MapItem>) => void;
  removeItem: (id: string) => void;
  beginEdit: () => void;
  endEdit: () => void;
}

const opsToText = (ops: Json | undefined): string =>
  ops === undefined ? "" : JSON.stringify(ops, null, 2);

/** One item row. The scheme `ops` textarea keeps a LOCAL text buffer so a
 *  half-typed / invalid JSON body doesn't get thrown away mid-edit; the doc is
 *  only written on a successful parse. External changes (undo, import) re-seed the
 *  buffer via the effect below. */
const ItemRow = ({
  item,
  setItemField,
  removeItem,
  beginEdit,
  endEdit,
}: {
  item: MapItem;
  setItemField: (id: string, patch: Partial<MapItem>) => void;
  removeItem: (id: string) => void;
  beginEdit: () => void;
  endEdit: () => void;
}) => {
  const [opsText, setOpsText] = useState(() => opsToText(item.ops));
  const [opsError, setOpsError] = useState(false);
  // Re-seed the buffer when the canonical ops change from OUTSIDE this input
  // (undo/redo/import) — but not on our own valid edits (already in sync).
  useEffect(() => {
    const canonical = opsToText(item.ops);
    setOpsText((cur) => {
      try {
        if (JSON.stringify(JSON.parse(cur)) === JSON.stringify(item.ops)) return cur;
      } catch {
        /* current buffer is unparseable — take the canonical value */
      }
      return canonical;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.ops]);

  const onOpsChange = (text: string) => {
    setOpsText(text);
    try {
      setItemField(item.id, { ops: JSON.parse(text) as Json });
      setOpsError(false);
    } catch {
      setOpsError(true); // keep the text; don't clobber the doc with garbage
    }
  };

  return (
    <Box borderRadius="0.3rem" p="0.4rem" bg="rgba(0,0,0,0.2)" display="flex" flexDir="column" gap="0.3rem">
      <Flex alignItems="center" gap="0.3rem">
        <Tag size="sm" bg={item.kind === "combat" ? "#7C4DBE" : "#E4B106"} color="white" flexShrink={0}>
          {item.kind}
        </Tag>
        <Text fontSize="0.65rem" fontFamily="monospace" opacity={0.7}>{item.id}</Text>
        <Button size="xs" ml="auto" colorScheme="red" variant="ghost" onClick={() => removeItem(item.id)}>
          ✕
        </Button>
      </Flex>
      <Input
        size="xs"
        placeholder="label"
        value={item.label}
        onFocus={beginEdit}
        onBlur={endEdit}
        onChange={(e) => setItemField(item.id, { label: e.target.value })}
      />
      {item.kind === "combat" ? (
        <Flex alignItems="center" gap="0.4rem">
          <Text fontSize="0.7rem" whiteSpace="nowrap">value +</Text>
          <Input
            size="xs"
            type="number"
            min={1}
            w="4rem"
            value={item.value ?? 1}
            onFocus={beginEdit}
            onBlur={endEdit}
            onChange={(e) => setItemField(item.id, { value: Number(e.target.value) })}
          />
        </Flex>
      ) : (
        <Box>
          <Text fontSize="0.62rem" opacity={0.6} mb="0.15rem">ops (raw JSON)</Text>
          <Textarea
            size="xs"
            rows={4}
            fontFamily="monospace"
            fontSize="0.6rem"
            value={opsText}
            onFocus={beginEdit}
            onBlur={endEdit}
            onChange={(e) => onOpsChange(e.target.value)}
            bg="rgba(0,0,0,0.3)"
            borderColor={opsError ? "brand.danger" : undefined}
            placeholder='[{ "op": "dealDamage", "amount": 1 }]'
          />
          {opsError && <Text fontSize="0.6rem" color="brand.danger">invalid JSON — not saved</Text>}
        </Box>
      )}
    </Box>
  );
};

export const ItemsPanel = ({ items, addItem, setItemField, removeItem, beginEdit, endEdit }: Props) => (
  <Box display="flex" flexDir="column" gap="0.4rem">
    <Flex alignItems="center" gap="0.3rem">
      <Text fontSize="0.7rem" fontWeight={700} letterSpacing="0.06em" textTransform="uppercase" opacity={0.75}>
        items
      </Text>
      <Button {...BTN} ml="auto" onClick={() => addItem("combat")}>+ combat</Button>
      <Button {...BTN} onClick={() => addItem("scheme")}>+ scheme</Button>
    </Flex>
    {items.length === 0 ? (
      <Text fontSize="0.68rem" opacity={0.55}>
        no battlefield items — add one, then assign it to a space in the inspector
      </Text>
    ) : (
      items.map((it) => (
        <ItemRow
          key={it.id}
          item={it}
          setItemField={setItemField}
          removeItem={removeItem}
          beginEdit={beginEdit}
          endEdit={endEdit}
        />
      ))
    )}
  </Box>
);
