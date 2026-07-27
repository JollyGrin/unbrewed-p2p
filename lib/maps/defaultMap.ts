/**
 * The board every game falls back to when no `mapUrl` is set.
 *
 * Render-only: never write this into `router.query.mapUrl`. `""` is the
 * "explicitly cleared" sentinel in WebGameProvider's map sync, so seeding the
 * query on mount would broadcast a map change to the whole room on every load.
 */
export const DEFAULT_MAP_URL = "/maps/legacy-the-mended-drum.webp";
