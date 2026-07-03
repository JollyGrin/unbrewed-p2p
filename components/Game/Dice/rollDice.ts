import { DiceRoll } from "@/lib/gamesocket/message";

/**
 * Generate a fair dice roll on the client. The roller decides the values in
 * plain JS; every client (including the roller) then renders these exact
 * `values` via dice-box-threejs predetermined notation (`NdS@v1,v2,...`), so
 * all screens land on the same faces.
 */
export function rollDice(
  by: string,
  sides: number,
  qty: number,
  modifier = 0,
): DiceRoll {
  const values: number[] = [];
  for (let i = 0; i < qty; i++) {
    values.push(1 + Math.floor(Math.random() * sides));
  }
  const sum = values.reduce((a, b) => a + b, 0);
  const mod =
    modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : "";
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    by,
    notation: `${qty}d${sides}${mod}`,
    values,
    total: sum + modifier,
    at: Date.now(),
  };
}

/**
 * Build the dice-box-threejs predetermined-outcome notation so the 3D dice
 * physically settle on `values`, e.g. `2d20@15,3`. The modifier is display-only
 * (baked into `total`); the physical dice are just the base NdS.
 */
export function toPredeterminedNotation(roll: DiceRoll): string {
  const base = roll.notation.split(/[+-]/)[0]; // strip any modifier → "NdS"
  return `${base}@${roll.values.join(",")}`;
}
