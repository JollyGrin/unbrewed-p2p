/**
 * Whether the tabletop view paints its zone discs over the board art (#1395).
 *
 * The maps already print their own zone circles — often a two- or three-
 * colour pie of their own — so a translucent disc laid over them at a
 * slightly different size shows both patterns through each other and makes
 * it HARDER to read a space's zones, not easier. The discs are therefore a
 * player preference, OFF by default: the art carries the zones, exactly as
 * on the flat board (ProBoard draws transparent hit circles only). When ON
 * the discs are fully opaque, so nothing shows through them.
 *
 * Pure vocabulary, kept apart from the hook (same shape as `boardView.ts`)
 * so tests and the board can import it without a React dependency.
 */
export const DEFAULT_ZONE_DISCS = false;

/** The stored form: `"on"` / `"off"`, never a bare boolean string. */
export const parseZoneDiscs = (stored: string | null | undefined): boolean =>
  stored === "on" ? true : stored === "off" ? false : DEFAULT_ZONE_DISCS;

export const serializeZoneDiscs = (on: boolean): "on" | "off" => (on ? "on" : "off");

/** The control's label, shared by both HUDs. */
export const ZONE_DISCS_LABEL = "Zone discs";

export const zoneDiscsStateLabel = (on: boolean): string => (on ? "on" : "off");
