/**
 * Lab-tier gate for the Adventures format (Wave 4.1, unbrewed-p2p#1093).
 *
 * Client env flag, build-time inlined (like NEXT_PUBLIC_PRO_WS_URL): set
 * `NEXT_PUBLIC_ADVENTURE_LAB=1` to surface adventure in the catalog/picker.
 * The property access must stay literal so Next can inline it. Whether this
 * becomes a server `formats[].tier` check is Dean's call at Wave 5.
 */
export const adventureLabEnabled = (): boolean => process.env.NEXT_PUBLIC_ADVENTURE_LAB === "1";
