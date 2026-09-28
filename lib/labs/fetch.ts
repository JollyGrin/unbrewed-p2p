import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { LabsLoadedSet, LabsSetRow } from "./labs.type";
import { fail } from "./errors";
import { LabsInput, parseLabsInput } from "./parse";
import { LabsImport, buildLabsImport, listLabsHeroes } from "./map";

/**
 * Unmatched Labs' public Supabase REST endpoint and publishable key — the same
 * pair their own web client ships, used here for the anonymous reads their
 * share pages make. CORS allows any origin, so the browser calls it directly.
 *
 * Every call here runs only because a player pressed Import (or, later, opened
 * a deep link): nothing polls, syncs, or lists their catalog.
 */
export const LABS_API = "https://kyqcvbnxfmpnbwtikzxp.supabase.co/rest/v1";
const LABS_KEY = "sb_publishable_g9vGj6W8XkWVosdPbLh1Ww_oa5Lrg1T";

type Fetch = typeof fetch;

const labsRequest = async <T,>(
  path: string,
  init: RequestInit | undefined,
  fetchImpl: Fetch,
): Promise<T> => {
  let res: Response;
  try {
    res = await fetchImpl(`${LABS_API}/${path}`, {
      ...init,
      headers: {
        apikey: LABS_KEY,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    return fail("network");
  }
  // PostgREST answers a missing row with `[]`, so any non-2xx is the service
  // itself being unwell, not the set being absent.
  if (!res.ok) return fail("network");
  try {
    return (await res.json()) as T;
  } catch {
    return fail("network");
  }
};

/** Resolve a character id to the share slug of the published set it lives in. */
const slugForCharacter = async (characterId: string, fetchImpl: Fetch) => {
  const rows = await labsRequest<{ slug?: string }[]>(
    `gallery_characters?select=slug&character_id=eq.${encodeURIComponent(characterId)}&limit=1`,
    undefined,
    fetchImpl,
  );
  return rows[0]?.slug ?? fail("character-not-found");
};

const setBySlug = async (slug: string, fetchImpl: Fetch) => {
  const rows = await labsRequest<LabsSetRow[]>(
    "rpc/set_by_slug",
    { method: "POST", body: JSON.stringify({ share_slug: slug }) },
    fetchImpl,
  );
  const row = rows[0];
  if (!row?.document?.set) return fail("not-found");
  return row;
};

/** Best-effort: the set owner's display name, for attribution. */
const authorOf = async (ownerId: string, fetchImpl: Fetch) => {
  try {
    const rows = await labsRequest<{ display_name?: string }[]>(
      `profiles?id=eq.${encodeURIComponent(ownerId)}&select=display_name&limit=1`,
      undefined,
      fetchImpl,
    );
    return rows[0]?.display_name?.trim() || undefined;
  } catch {
    return undefined;
  }
};

/**
 * Fetch the set a pasted link / id points at. Throws `LabsImportError`.
 * `fetchImpl` is injectable for tests.
 */
export const fetchLabsSet = async (
  raw: string | LabsInput,
  fetchImpl: Fetch = fetch,
): Promise<LabsLoadedSet> => {
  const input = typeof raw === "string" ? parseLabsInput(raw) : raw;
  if (!input) return fail("bad-input");

  const slug =
    input.slug ?? (input.kind === "character"
      ? await slugForCharacter(input.characterId, fetchImpl)
      : fail("bad-input"));
  const row = await setBySlug(slug, fetchImpl);
  const characterId = input.kind === "character" ? input.characterId : undefined;
  // An Adventures set (villain + minions): no hero to pick, whatever the link names.
  const characters = row.document.set.characters ?? [];
  if (characters.length > 0 && !characters.some((c) => c.role === "hero" || c.role === undefined)) {
    fail("no-heroes");
  }
  if (characterId && !row.document.set.characters?.some((c) => c.id === characterId)) {
    fail("character-not-found");
  }
  return { row, characterId, author: await authorOf(row.owner_id, fetchImpl) };
};

/**
 * Pick which hero of a loaded set to import: the one the link named, else the
 * only hero in the set. `undefined` means the player has to choose.
 */
export const defaultLabsCharacter = (loaded: LabsLoadedSet): string | undefined => {
  if (loaded.characterId) return loaded.characterId;
  const heroes = listLabsHeroes(loaded.row.document.set);
  return heroes.length === 1 ? heroes[0].id : undefined;
};

/**
 * One call from a link / id to a bag-ready import, for callers with no UI to
 * offer a hero choice (e.g. `?deckId=` deep links). Throws `LabsImportError`.
 */
export const fetchLabsImport = async (
  raw: string | LabsInput,
  fetchImpl: Fetch = fetch,
): Promise<LabsImport> => {
  const loaded = await fetchLabsSet(raw, fetchImpl);
  const characterId = defaultLabsCharacter(loaded) ?? fail("choose-character");
  return buildLabsImport(loaded, characterId);
};

export const fetchLabsDeck = async (
  raw: string | LabsInput,
  fetchImpl: Fetch = fetch,
): Promise<DeckImportType> => (await fetchLabsImport(raw, fetchImpl)).deck;
