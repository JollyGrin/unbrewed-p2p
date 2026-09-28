import {
  DeckImportHeroType,
  DeckImportRuleCardType,
  DeckImportSidekickType,
} from "../DeckPool/deck-import.type";
import {
  actions,
  cardStyles,
  cardConstants as conprops,
  MeasureCanvas,
} from "./card.helpers";

/**
 * Hero, sidekick and rule cards drawn in the action-card template's frame
 * (issue #1007). The sandbox shows these as text panels, never as cards, but
 * table.place lays them out face-up beside the deck — so they need a face, and
 * it should read as part of the same set: cream rim, black text panel, Bebas
 * headings, Archivo body, the canton down the left.
 *
 * Pure and layout-in-props like CardSvg, so it string-renders too. Long
 * abilities and rule texts shrink the body type until they fit rather than
 * spilling off the card.
 */

const W = conprops.width;
const H = conprops.height;
const b = conprops.outerBorderWidth;
const innerW = W - 2 * b;
const innerH = H - 2 * b;
const pad = conprops.bottomPanelPadding;
const maxText = innerW - 2 * pad;
const TITLE = 5;
const HEADING = 4;
/** Body sizes tried in order — the action cards' 3.3 first. */
const BODY_SIZES = [3.3, 3, 2.7, 2.4, 2.1, 1.9];

const wrapText = (
  text: string | undefined,
  font: string,
  canvas: MeasureCanvas,
  maxLength = maxText,
): string[] =>
  (text ?? "")
    .trim()
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => actions.wrapLines(p.split(/\s+/), font, maxLength, 0, canvas));

type Block = { lines: string[]; size: number };

/** Largest body size at which `text` fits in `room` height units. */
const fitBody = (
  text: string | undefined,
  room: number,
  canvas: MeasureCanvas,
): Block => {
  let last: Block = { lines: [], size: BODY_SIZES[0] };
  for (const size of BODY_SIZES) {
    const lines = wrapText(text, `${size}px ArchivoNarrow`, canvas);
    last = { lines, size };
    if (lines.length * size * 1.15 <= room) break;
  }
  return last;
};

export type CharacterCardProps = ReturnType<typeof characterCardProps>;

export const characterCardProps = (
  character: DeckImportHeroType | DeckImportSidekickType,
  kind: "hero" | "sidekick",
  canvas: MeasureCanvas,
) => {
  const titleLines = actions.wrapLines(
    (character.name || (kind === "hero" ? "Hero" : "Sidekick")).split(" "),
    `${TITLE}px BebasNeueRegular`,
    maxText,
    0,
    canvas,
  );
  const body =
    kind === "hero"
      ? (character as DeckImportHeroType).specialAbility
      : character.quote;
  // Title + stat line + padding around them; the art keeps at least ~40%.
  const header = 6 * titleLines.length + 1.5 + HEADING * 1.3 + 2;
  const bodyBlock = fitBody(body, innerH * 0.6 - header - 4, canvas);
  const bodyH = bodyBlock.lines.length * bodyBlock.size * 1.15;
  const panelH = Math.max(28.8, header + bodyH + 4);
  return {
    titleLines,
    bodyBlock,
    panelH,
    panelY: innerH - panelH,
  };
};

const statLine = (
  character: DeckImportHeroType | DeckImportSidekickType,
  kind: "hero" | "sidekick",
) =>
  [
    character.isRanged ? "RANGED" : "MELEE",
    kind === "hero" && typeof (character as DeckImportHeroType).move === "number"
      ? `MOVE ${(character as DeckImportHeroType).move}`
      : "",
    kind === "sidekick" && ((character as DeckImportSidekickType).quantity ?? 0) > 1
      ? `×${(character as DeckImportSidekickType).quantity}`
      : "",
  ]
    .filter(Boolean)
    .join("  ·  ");

const Frame = ({
  idPrefix,
  width,
  height,
  children,
}: {
  idPrefix: string;
  width: string | number;
  height: string | number;
  children: React.ReactNode;
}) => (
  <svg
    preserveAspectRatio="xMinYMin meet"
    viewBox="0 0 63 88"
    shapeRendering="geometricPrecision"
    width={width}
    height={height}
    style={{ userSelect: "none" }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <clipPath id={`${idPrefix}innerBorder`}>
      <rect width={innerW} height={innerH} rx={conprops.innerCornerRadius} />
    </clipPath>
    <rect
      width={W}
      height={H}
      rx={conprops.cornerRadius}
      style={actions.outerBorderStyle()}
    />
    <g
      transform={`translate(${b} ${b})`}
      clipPath={`url(#${idPrefix}innerBorder)`}
    >
      {children}
    </g>
  </svg>
);

const CornerLabel = ({ text }: { text: string }) => (
  <text
    x={innerW - 1.5}
    y={innerH - 1.5}
    textAnchor="end"
    style={cardStyles.bottomCornerStyle}
  >
    {text}
  </text>
);

const BodyText = ({ block, y }: { block: Block; y: number }) =>
  block.lines.length ? (
    <text
      y={y}
      style={{
        fill: "#fff",
        fontFamily: "ArchivoNarrow",
        fontSize: `${block.size}px`,
      }}
    >
      {block.lines.map((line, i) => (
        <tspan key={i} x={pad} dy={i ? block.size * 1.15 : 0}>
          {line}
        </tspan>
      ))}
    </text>
  ) : null;

export const CharacterCardSvg = ({
  character,
  kind,
  props,
  artUrl,
  width = "100%",
  height = "100%",
  idPrefix = "",
}: {
  character: DeckImportHeroType | DeckImportSidekickType;
  kind: "hero" | "sidekick";
  props: CharacterCardProps;
  /** Art for the top panel; the panel stays plain when there is none. */
  artUrl?: string;
  width?: string | number;
  height?: string | number;
  idPrefix?: string;
}) => {
  const { titleLines, bodyBlock, panelH, panelY } = props;
  const artH = panelY - conprops.hRuleThickness;
  const ruleY = panelY + 1.5 + 6 * titleLines.length;
  return (
    <Frame idPrefix={idPrefix} width={width} height={height}>
      <clipPath id={`${idPrefix}topPanel`}>
        <rect width={innerW} height={artH} />
      </clipPath>
      <rect width={innerW} height={artH} fill="#2C1831" />
      {artUrl && (
        <image
          width={innerW}
          height={artH}
          href={artUrl}
          clipPath={`url(#${idPrefix}topPanel)`}
          preserveAspectRatio="xMidYMid slice"
        />
      )}
      {/* canton: health on top where an action card shows its value */}
      <polygon
        style={actions.outerBorderStyle()}
        points="0,0 10,0 10,39.6 5,42.9 0,40.1"
      />
      <polygon
        style={actions.namePanel()}
        points="0,14.2 10,14.2 10,39.87 5,42.77 0,39.9"
      />
      <text
        x="-20"
        y="7"
        textAnchor="end"
        transform="rotate(-90 0 0)"
        style={cardStyles.characterNameStyle}
      >
        {kind === "hero" ? "HERO" : "SIDEKICK"}
      </text>
      <polygon fill="#C0392B" points="0,0 10,0 10,14.2 5,17.1 0,14.2" />
      <text
        x="5"
        y="3.4"
        textAnchor="middle"
        style={{ ...cardStyles.bottomCornerStyle, fontSize: "2.2px" }}
      >
        HEALTH
      </text>
      <text x="5" y="12.2" textAnchor="middle" style={cardStyles.cardValueStyle}>
        {character.hp ?? "–"}
      </text>
      <rect
        width={innerW}
        height={panelH}
        y={panelY}
        style={cardStyles.bottomPanelStyle}
      />
      <text style={cardStyles.titleTextStyle} y={panelY} dy="6">
        {titleLines.map((line, i) => (
          <tspan key={i} x={pad} dy="6">
            {line}
          </tspan>
        ))}
      </text>
      <line
        x1={pad}
        y1={ruleY}
        x2={innerW - pad}
        y2={ruleY}
        strokeWidth="0.4"
        stroke="#fff"
      />
      <text
        x={pad}
        y={ruleY + HEADING * 1.15}
        style={cardStyles.sectionHeadingStyle}
      >
        {statLine(character, kind)}
      </text>
      <BodyText block={bodyBlock} y={ruleY + HEADING * 1.3 + bodyBlock.size * 1.1} />
      <CornerLabel text={kind === "hero" ? "HERO" : "SIDEKICK"} />
    </Frame>
  );
};

export type RuleCardProps = ReturnType<typeof ruleCardProps>;

export const ruleCardProps = (
  rule: DeckImportRuleCardType,
  canvas: MeasureCanvas,
) => {
  const titleLines = actions.wrapLines(
    (rule.title?.trim() || "Rules").split(" "),
    `${TITLE}px BebasNeueRegular`,
    maxText,
    0,
    canvas,
  );
  const top = 3 + 6 * titleLines.length + 1.5;
  return { titleLines, bodyBlock: fitBody(rule.content, innerH - top - 7, canvas) };
};

export const RuleCardSvg = ({
  props,
  width = "100%",
  height = "100%",
  idPrefix = "",
}: {
  props: RuleCardProps;
  width?: string | number;
  height?: string | number;
  idPrefix?: string;
}) => {
  const { titleLines, bodyBlock } = props;
  const ruleY = 3 + 6 * titleLines.length + 1.5;
  return (
    <Frame idPrefix={idPrefix} width={width} height={height}>
      <rect width={innerW} height={innerH} style={cardStyles.bottomPanelStyle} />
      <text style={cardStyles.titleTextStyle} y={3}>
        {titleLines.map((line, i) => (
          <tspan key={i} x={pad} dy="6">
            {line}
          </tspan>
        ))}
      </text>
      <line
        x1={pad}
        y1={ruleY}
        x2={innerW - pad}
        y2={ruleY}
        strokeWidth="0.4"
        stroke="#fff"
      />
      <BodyText block={bodyBlock} y={ruleY + 2 + bodyBlock.size} />
      <CornerLabel text="RULES" />
    </Frame>
  );
};
