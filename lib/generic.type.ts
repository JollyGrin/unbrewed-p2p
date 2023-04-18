export type DateString = `${
  | "Mon"
  | "Tue"
  | "Wed"
  | "Thu"
  | "Fri"
  | "Sat"
  | "Sun"}, ${number} ${
  | "Jan"
  | "Feb"
  | "Mar"
  | "Apr"
  | "May"
  | "Jun"
  | "Jul"
  | "Aug"
  | "Sep"
  | "Oct"
  | "Nov"
  | "Dec"} ${number} ${number}:${number}:${number} GMT`;

export type HexColorString = `#${string}`;
export type ValidUrlString = `${"http" | "https"}://${string}.${string}`;
