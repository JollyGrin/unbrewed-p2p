/**
 * Labs components — game pieces, character tokens, health dials and
 * picture-only figures — as saved tokens on the imported deck (#1001).
 *
 * The images come from the set's hosted Tabletop Simulator save, not the raw
 * set row: the save holds finished faces (both sides upright, dials cut to
 * shape), where a raw two-sided image has its back rotated 180° and a raw
 * figure image can be a texture atlas. Figures with an uploaded 3D model are
 * never imported, and no model file is ever fetched.
 */
import type {
  DeckImportType,
  LabsComponentRecord,
} from "@/components/DeckPool/deck-import.type";
import {
  type SavedToken,
  type SheetCrop,
  clampLabel,
} from "@/components/Positions/position.type";
import { LabsCharacter, LabsFigure, LabsSet, LabsTtsModel } from "./labs.type";

const COMPONENT_KINDS = ["dial", "piece", "token", "figure"] as const;
type ComponentKind = (typeof COMPONENT_KINDS)[number];

const kindOf = (f: LabsFigure): ComponentKind =>
  f.kind === "dial" || f.kind === "piece" || f.kind === "token" ? f.kind : "figure";

const has = (s: string | null | undefined) => !!s && s.trim() !== "";

/** Labs keeps blank placeholder figures; only a named / pictured / modelled one is real. */
export const isCountableFigure = (f: LabsFigure) =>
  has(f.name) || has(f.reference?.source) || !!f.model;

/** Whether an import of this set should look up its hosted save at all. */
export const hasLabsComponents = (set: LabsSet) =>
  (set.figures ?? []).some((f) => isCountableFigure(f) && !f.model);

const https = (url: unknown): string | undefined =>
  typeof url === "string" && /^https:\/\//i.test(url) ? url : undefined;

/**
 * The `Custom_Model` objects of a hosted save, in save order (bags walked).
 * Anything that isn't a save reads as no components.
 */
export const parseLabsTtsSave = (save: unknown): LabsTtsModel[] => {
  const out: LabsTtsModel[] = [];
  const walk = (objects: unknown) => {
    if (!Array.isArray(objects)) return;
    for (const o of objects) {
      if (!o || typeof o !== "object") continue;
      const obj = o as Record<string, any>;
      if (obj.Name === "Custom_Model") {
        const mesh = obj.CustomMesh ?? {};
        out.push({
          nickname: typeof obj.Nickname === "string" ? obj.Nickname : "",
          imageUrl: https(mesh.DiffuseURL),
          isDial: /\/health-dial-[^/]*\.obj$/i.test(String(mesh.MeshURL ?? "")),
        });
      }
      walk(obj.ContainedObjects);
    }
  };
  walk((save as { ObjectStates?: unknown } | null)?.ObjectStates);
  return out;
};

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Pair each figure with its save object. Labs writes the save in `figures[]`
 * order, one object per exported figure, so this walks both lists forward:
 *
 * - a named figure takes the next object of the same class (dial / not dial)
 *   with the same name, so two figures that share a name pair up in order;
 * - a blank-named figure takes the next object of the same class whose name
 *   is not any named figure's — the save invents one for it ("Pink Panther's
 *   health dial", "Untitled health dial", "Untitled figure");
 * - a figure the save left out (a blank stub) matches nothing, and the walk
 *   carries on from where it was.
 */
export const matchLabsFigures = (
  figures: LabsFigure[],
  models: LabsTtsModel[],
): Map<string, LabsTtsModel> => {
  const named = new Set(figures.filter((f) => has(f.name)).map((f) => norm(f.name)));
  const matched = new Map<string, LabsTtsModel>();
  let cursor = 0;
  for (const figure of figures) {
    const isDial = figure.kind === "dial";
    const wanted = norm(figure.name);
    for (let i = cursor; i < models.length; i++) {
      const model = models[i];
      if (model.isDial !== isDial) continue;
      const nick = norm(model.nickname);
      if (wanted ? nick === wanted : !named.has(nick)) {
        matched.set(figure.id, model);
        cursor = i + 1;
        break;
      }
    }
  }
  return matched;
};

/** Hosted-save face layouts, measured on the Lucy & Piper and Pink Panther saves. */
const SHEETS = {
  /** 512x1024: the dial face twice, stacked */
  dial: { cols: 1, rows: 2, index: 0 },
  /** 1024x512: front and back side by side, both upright */
  twoSided: { cols: 2, rows: 1, index: 0 },
  /** 512x640: the face on top, the token's 128px edge strip under it */
  oneSided: { cols: 1, rows: 640 / 512, index: 0 },
} satisfies Record<string, SheetCrop>;

const SIZES: Record<ComponentKind, number> = {
  dial: 96,
  piece: 72,
  token: 72,
  figure: 72,
};

export type LabsComponentTokens = {
  tokens: SavedToken[];
  record: LabsComponentRecord[];
};

/**
 * The component tokens for one hero of a set, in `figures[]` order: only
 * components tied to that hero or to no character, only ones the save has an
 * image for, never a figure with an uploaded model.
 *
 * Round (`clip`) for dials and circle-shaped Labs tokens, labelled with the
 * component's name when it has one, and flippable (`altIndex`) to the back
 * of a two-sided piece.
 *
 * Dials: the hero's own dial follows hero health, a dial that belongs to an
 * enabled sidekick follows sidekick health, and any other (a second fighter
 * such as Piper, or an unowned dial) is a free number starting at its max.
 * Labs does not say which fighter a dial is for, so "whose" is read off the
 * dial's range: the hero's dial is the one whose max is the hero's health.
 */
export const labsComponentTokens = (
  set: LabsSet,
  hero: LabsCharacter,
  models: LabsTtsModel[],
): LabsComponentTokens => {
  const figures = set.figures ?? [];
  const matched = matchLabsFigures(figures, models);
  const mine = figures.filter(
    (f) =>
      (!f.characterId || f.characterId === hero.id) &&
      isCountableFigure(f) &&
      !f.model &&
      !!matched.get(f.id)?.imageUrl,
  );

  const dials = mine.filter((f) => f.kind === "dial");
  const max = (f: LabsFigure) => f.dialRange?.max;
  const heroDial =
    dials.find((f) => f.characterId === hero.id && max(f) === hero.health) ??
    dials.find((f) => max(f) === hero.health) ??
    dials.find((f) => f.characterId === hero.id);
  const sidekick = hero.sidekick?.enabled ? hero.sidekick : undefined;
  const sidekickName = norm(sidekick?.name);
  const sidekickDial = sidekick
    ? dials.find(
        (f) =>
          f !== heroDial &&
          (max(f) === sidekick.health ||
            (!!sidekickName && norm(f.name).includes(sidekickName))),
      )
    : undefined;

  const tokens: SavedToken[] = [];
  const record: LabsComponentRecord[] = [];
  for (const figure of mine) {
    const kind = kindOf(figure);
    const imageUrl = matched.get(figure.id)!.imageUrl!;
    const sheet =
      kind === "dial"
        ? SHEETS.dial
        : figure.token?.twoSided
          ? SHEETS.twoSided
          : SHEETS.oneSided;
    const token: SavedToken = { imageUrl, sheet: { ...sheet }, size: SIZES[kind] };
    // Display fields (#1003): an old client ignores them and draws the image.
    if (kind === "dial" || figure.token?.shape === "circle") token.clip = "circle";
    const label = clampLabel(figure.name?.trim() ?? "").trim();
    if (label) token.label = label;
    if (sheet === SHEETS.twoSided) token.altIndex = 1;
    if (kind === "dial") {
      token.counter =
        figure === heroDial
          ? { link: "hero" }
          : figure === sidekickDial
            ? { link: "sidekick" }
            : { value: max(figure) ?? 0 };
    }
    tokens.push(token);
    record.push({ key: figure.id, kind, url: imageUrl });
  }
  return { tokens, record };
};

/** Figure ids a built deck brought in, for the "not imported" summary. */
export const importedFigureIds = (deck: DeckImportType): Set<string> =>
  new Set((deck.labsComponents ?? []).map((c) => c.key));

const sameCell = (a: SavedToken, b: SavedToken) =>
  (a.sheet?.index ?? 0) === (b.sheet?.index ?? 0);

/**
 * Refresh: fold a newer import's component tokens into the saved loadout.
 * `tokens` already had their images swapped where the record found them
 * (see `refreshSavedTokens`). Never removes or reorders a token:
 *
 * - a component the old record knows is left as the player has it — swapped
 *   already if it is still there, and left out if the player removed it;
 * - a component the old record doesn't know is appended, unless a token with
 *   its image is already on the deck.
 */
export const mergeLabsComponentTokens = (
  tokens: SavedToken[],
  known: LabsComponentRecord[] | undefined,
  fetched: DeckImportType,
): SavedToken[] => {
  const fresh = fetched.labsComponents ?? [];
  if (fresh.length === 0) return tokens;
  const knownKeys = new Set((known ?? []).map((c) => c.key));
  const byUrl = new Map(
    (fetched.savedTokens ?? []).map((t) => [t.imageUrl, t] as const),
  );
  const added: SavedToken[] = [];
  for (const component of fresh) {
    if (knownKeys.has(component.key)) continue;
    const token = byUrl.get(component.url);
    if (!token) continue;
    const present = tokens.some((t) => t.imageUrl === component.url && sameCell(t, token));
    if (!present) added.push(token);
  }
  return added.length ? [...tokens, ...added] : tokens;
};
