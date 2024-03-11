export type Size = "sm" | "md" | "lg";
export type PositionType = {
  id: string;
  x: number;
  y: number;
  r?: number;
  tokenSize?: Size;
  color?: string;
  sidekicks?: Sidekick[];
};

type Sidekick = Omit<PositionType, "sidekicks">;
