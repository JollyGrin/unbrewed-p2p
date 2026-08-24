/**
 * Map-level battlefield-items editor (engine #157 / protocol v17). Add/remove
 * `MapItem`s and edit their fields: label, and either a combat `value` (≥1) or —
 * since p2p #693 — a scheme effect picked from a curated menu.
 *
 * The v1 raw-JSON textarea is still here, demoted to an explicit **Advanced**
 * toggle: `ops` is the server's full card-effect DSL, so the menu deliberately
 * covers only shapes verified against the engine (see ./schemeOps) and the
 * textarea is the escape hatch for the tail. A row opens in Advanced only when
 * the ops on the item aren't something the builder itself could have written.
 *
 * Assigning an item to a space happens in the space inspector; this panel only
 * defines the items.
 *
 * Purely presentational: every mutation is routed up through the callbacks so the
 * single history layer owns all state. Text edits fold into ONE undo entry via the
 * begin/end transient pair, matching the rest of the toolbar.
 */
import { useEffect, useState } from "react";
import { Box, Button, Flex, Input, Select, Tag, Text, Textarea } from "@chakra-ui/react";
import type { Json } from "@/lib/pro/protocol";
import type { MapItem } from "./model";
import {
  DEFAULT_SCHEME_EFFECT,
  SCHEME_EFFECT_OPTIONS,
  SchemeEffect,
  SchemeEffectKind,
  effectsFromOps,
  effectsText,
  newEffect,
  opsFromEffects,
  optionFor,
} from "./schemeOps";
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

const ADVANCED_DISCARD_WARNING =
  "These ops aren't one of the builder's effects, so switching back will REPLACE them with the default effect (draw 1). Continue?";

/** The picker for ONE effect in an item's stack: kind + (for heal/draw) amount. */
const EffectRow = ({
  effect,
  onChange,
  onRemove,
  beginEdit,
  endEdit,
}: {
  effect: SchemeEffect;
  onChange: (next: SchemeEffect) => void;
  onRemove: () => void;
  beginEdit: () => void;
  endEdit: () => void;
}) => {
  const option = optionFor(effect.kind);
  return (
    <Flex alignItems="center" gap="0.3rem">
      <Select
        size="xs"
        flex="1"
        minW="0"
        aria-label="effect"
        value={effect.kind}
        onChange={(e) => onChange(newEffect(e.target.value as SchemeEffectKind))}
      >
        {SCHEME_EFFECT_OPTIONS.map((o) => (
          <option key={o.kind} value={o.kind}>{o.label}</option>
        ))}
      </Select>
      {option.amountLabel && "amount" in effect && (
        <Input
          size="xs"
          type="number"
          min={1}
          w="3.6rem"
          flexShrink={0}
          aria-label={`${option.label} amount`}
          value={effect.amount}
          onFocus={beginEdit}
          onBlur={endEdit}
          onChange={(e) =>
            onChange({ ...effect, amount: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
          }
        />
      )}
      <Button size="xs" variant="ghost" colorScheme="red" flexShrink={0} aria-label="remove effect" onClick={onRemove}>
        ✕
      </Button>
    </Flex>
  );
};

/** The whole curated builder for one scheme item: a stack of effects + preview. */
const SchemeEffectBuilder = ({
  effects,
  setEffects,
  beginEdit,
  endEdit,
}: {
  effects: SchemeEffect[];
  setEffects: (next: SchemeEffect[]) => void;
  beginEdit: () => void;
  endEdit: () => void;
}) => (
  <Box display="flex" flexDir="column" gap="0.3rem">
    <Text fontSize="0.62rem" opacity={0.6}>effect</Text>
    {effects.length === 0 && (
      <Text fontSize="0.62rem" color="brand.danger">
        no effect yet — add one, or this map won&apos;t load
      </Text>
    )}
    {effects.map((eff, i) => (
      <EffectRow
        key={i}
        effect={eff}
        beginEdit={beginEdit}
        endEdit={endEdit}
        onChange={(next) => setEffects(effects.map((e, j) => (j === i ? next : e)))}
        onRemove={() => setEffects(effects.filter((_, j) => j !== i))}
      />
    ))}
    <Button {...BTN} alignSelf="flex-start" onClick={() => setEffects([...effects, newEffect("heal")])}>
      + effect
    </Button>
    {effects.length > 0 && (
      <Text fontSize="0.62rem" opacity={0.75} fontStyle="italic">
        players see: “{effectsText(effects)}”
      </Text>
    )}
  </Box>
);

/** The raw-JSON escape hatch. Keeps a LOCAL text buffer so a half-typed / invalid
 *  JSON body doesn't get thrown away mid-edit; the doc is only written on a
 *  successful parse. External changes (undo, import) re-seed the buffer. */
const AdvancedOpsEditor = ({
  item,
  setItemField,
  beginEdit,
  endEdit,
}: {
  item: MapItem;
  setItemField: (id: string, patch: Partial<MapItem>) => void;
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
    <Box>
      <Text fontSize="0.62rem" opacity={0.6} mb="0.15rem">ops (raw JSON)</Text>
      <Textarea
        size="xs"
        rows={4}
        fontFamily="monospace"
        fontSize="0.6rem"
        aria-label="ops (raw JSON)"
        value={opsText}
        onFocus={beginEdit}
        onBlur={endEdit}
        onChange={(e) => onOpsChange(e.target.value)}
        bg="rgba(0,0,0,0.3)"
        borderColor={opsError ? "brand.danger" : undefined}
        placeholder='[{ "op": "dealDamage", "amount": 1 }]'
      />
      {opsError && <Text fontSize="0.6rem" color="brand.danger">invalid JSON — not saved</Text>}
      <Text fontSize="0.62rem" opacity={0.6} mt="0.25rem" mb="0.15rem">effect text (required)</Text>
      <Input
        size="xs"
        aria-label="effect text (required)"
        placeholder="what players see on the item, e.g. “Deal 1 damage.”"
        value={item.text ?? ""}
        onFocus={beginEdit}
        onBlur={endEdit}
        onChange={(e) => setItemField(item.id, { text: e.target.value })}
      />
    </Box>
  );
};

/** One item row. */
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
  const effects = item.kind === "scheme" ? effectsFromOps(item.ops) : [];
  // Advanced is sticky per row, and forced ON whenever the ops stop being
  // builder-representable (an import of hand-written ops, an undo back into
  // them) — never forced off, so typing builder-shaped JSON by hand doesn't
  // yank the textarea away mid-edit.
  const [advanced, setAdvanced] = useState(effects === null);
  useEffect(() => {
    if (item.kind === "scheme" && effectsFromOps(item.ops) === null) setAdvanced(true);
  }, [item.kind, item.ops]);

  const setEffects = (next: SchemeEffect[]) =>
    setItemField(item.id, { ops: opsFromEffects(next), text: effectsText(next) });

  const leaveAdvanced = () => {
    if (effects !== null) { setAdvanced(false); return; } // already builder-shaped: keep it
    // eslint-disable-next-line no-alert
    if (!window.confirm(ADVANCED_DISCARD_WARNING)) return;
    setEffects([DEFAULT_SCHEME_EFFECT]);
    setAdvanced(false);
  };

  return (
    <Box borderRadius="0.3rem" p="0.4rem" bg="rgba(0,0,0,0.2)" display="flex" flexDir="column" gap="0.3rem">
      <Flex alignItems="center" gap="0.3rem">
        <Tag size="sm" bg={item.kind === "combat" ? "#7C4DBE" : "#E4B106"} color="white" flexShrink={0}>
          {item.kind}
        </Tag>
        <Text fontSize="0.65rem" fontFamily="monospace" opacity={0.7}>{item.id}</Text>
        <Button size="xs" ml="auto" colorScheme="red" variant="ghost" aria-label={`remove ${item.id}`} onClick={() => removeItem(item.id)}>
          ✕
        </Button>
      </Flex>
      <Input
        size="xs"
        placeholder="label"
        aria-label={`${item.id} label`}
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
            aria-label={`${item.id} value`}
            value={item.value ?? 1}
            onFocus={beginEdit}
            onBlur={endEdit}
            onChange={(e) => setItemField(item.id, { value: Number(e.target.value) })}
          />
        </Flex>
      ) : (
        <>
          {advanced ? (
            <AdvancedOpsEditor item={item} setItemField={setItemField} beginEdit={beginEdit} endEdit={endEdit} />
          ) : (
            <SchemeEffectBuilder
              effects={effects ?? []}
              setEffects={setEffects}
              beginEdit={beginEdit}
              endEdit={endEdit}
            />
          )}
          <Button
            {...BTN}
            alignSelf="flex-start"
            onClick={() => (advanced ? leaveAdvanced() : setAdvanced(true))}
          >
            {advanced ? "← effect builder" : "advanced (raw JSON)"}
          </Button>
        </>
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
