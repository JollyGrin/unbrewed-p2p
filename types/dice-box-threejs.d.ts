// Minimal ambient types for @3d-dice/dice-box-threejs (ships no types).
// Only what we use: construct with a container selector + config, then roll().
declare module "@3d-dice/dice-box-threejs" {
  export interface DiceBoxConfig {
    framerate?: number;
    sounds?: boolean;
    volume?: number;
    color_spotlight?: number;
    shadows?: boolean;
    theme_surface?: string;
    sound_dieMaterial?: string;
    theme_customColorset?: {
      background?: string;
      foreground?: string;
      texture?: string;
      material?: string;
    } | null;
    theme_colorset?: string;
    theme_texture?: string;
    theme_material?: string;
    gravity_multiplier?: number;
    light_intensity?: number;
    baseScale?: number;
    strength?: number;
    onRollComplete?: (results: unknown) => void;
  }

  export default class DiceBox {
    constructor(container: string, config?: DiceBoxConfig);
    // Must be awaited before roll() — it creates the renderer/scene. The
    // library does NOT auto-call this (the README omits it).
    initialize(): Promise<void>;
    roll(notation: string): Promise<unknown>;
    add(notation: string): Promise<unknown>;
    clearDice(): void;
    updateConfig(config: DiceBoxConfig): void;
  }
}
