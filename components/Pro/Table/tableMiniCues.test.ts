import { miniCuesFor, recoilStrength, type MiniCueInput, type TableStrike } from "./tableMiniCues";

const positions = new Map([
  ["p1/hero", { x: 0.2, y: 0.5 }],
  ["p2/hero", { x: 0.4, y: 0.5 }],
  ["p2/sk", { x: 0.8, y: 0.2 }],
]);
const strike: TableStrike = {
  key: "c1",
  attacker: "p1/hero",
  target: "p2/hero",
  variant: "win",
  damage: 3,
  lungeDelayMs: 850,
  lungeMs: 680,
  contactMs: 1149,
  reactMs: 680,
};
const cues = (id: string, over: Partial<MiniCueInput> = {}) =>
  miniCuesFor({
    fighter: { id, space: id === "p1/hero" ? "a1" : id === "p2/hero" ? "a2" : "b9" },
    selected: false,
    targetable: false,
    attack: null,
    strike: null,
    positions,
    fx: [],
    ...over,
  });

test("a fighter with nothing going on just stands (and drops in when it appears)", () => {
  expect(cues("p2/sk")).toEqual({ dropIn: true, held: false, faceToward: null, lunge: null, recoil: null, flinch: null });
});

test("selected or targetable: held (the select lift)", () => {
  expect(cues("p1/hero", { selected: true }).held).toBe(true);
  expect(cues("p1/hero", { targetable: true }).held).toBe(true);
});

test("the live combat's pair face each other; a bystander does not turn", () => {
  const attack = { attacker: "p1/hero", target: "p2/hero" };
  expect(cues("p1/hero", { attack }).faceToward).toEqual({ x: 0.4, y: 0.5 });
  expect(cues("p2/hero", { attack }).faceToward).toEqual({ x: 0.2, y: 0.5 });
  expect(cues("p2/sk", { attack }).faceToward).toBeNull();
});

test("after the combat resolves they keep facing each other through the strike", () => {
  expect(cues("p1/hero", { strike }).faceToward).toEqual({ x: 0.4, y: 0.5 });
});

test("the attacker lunges on the panel's clock; the defender recoils from the contact", () => {
  expect(cues("p1/hero", { strike }).lunge).toEqual({ key: "c1", delayMs: 850, durMs: 680, strength: 1 });
  expect(cues("p1/hero", { strike }).recoil).toBeNull();
  expect(cues("p2/hero", { strike }).recoil).toEqual({ key: "c1", delayMs: 1149, durMs: 680, strength: recoilStrength(strike) });
  expect(cues("p2/hero", { strike }).lunge).toBeNull();
});

test("a block only rocks the defender; more damage knocks back harder", () => {
  expect(recoilStrength({ variant: "blocked", damage: 0 })).toBeLessThan(recoilStrength({ variant: "win", damage: 1 }));
  expect(recoilStrength({ variant: "win", damage: 4 })).toBeGreaterThan(recoilStrength({ variant: "win", damage: 1 }));
});

test("a damage beat on its space makes it flinch; a block or heal does not", () => {
  expect(cues("p2/hero", { fx: [{ key: "fx-3", space: "a2", kind: "damage" }] }).flinch).toEqual({ key: "fx-3" });
  expect(cues("p2/hero", { fx: [{ key: "fx-4", space: "a2", kind: "blocked" }] }).flinch).toBeNull();
  expect(cues("p2/hero", { fx: [{ key: "fx-5", space: "a1", kind: "damage" }] }).flinch).toBeNull();
});
