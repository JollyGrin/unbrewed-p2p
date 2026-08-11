import { config } from "@remotion/eslint-config-flat";

export default [
  ...config,
  {
    // The promo helper scripts are Node, not composition code.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
];
