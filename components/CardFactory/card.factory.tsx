import { Fragment, memo, useEffect, useMemo, useState } from "react";
import { DeckImportCardType } from "../DeckPool/deck-import.type";
import {
  calculateProps,
  cardStyles,
  cardConstants as conprops,
  getMeasureCanvas,
  MeasureCanvas,
  roundNumber,
} from "./card.helpers";
import IconSvg from "./IconSvg";

/**
 * Memoized: layout (text measurement + wrapping) is expensive, and
 * hands/grids render dozens of these — parent re-renders must not
 * re-layout every card.
 */
const CardFactoryBase: React.FC<{ card: DeckImportCardType }> = ({ card }) => {
  // set after mount so server render and first client render match
  const [canvas, setCanvas] = useState<MeasureCanvas>();
  useEffect(() => {
    if (canvas) return;
    setCanvas(getMeasureCanvas());
  }, [canvas]);

  const props = useMemo(
    () => (canvas && card ? calculateProps(card, canvas) : undefined),
    [card, canvas],
  );

  if (!props || !card) return <div />;

  // DOM-rendered cards (hand, deck-info grid, hover preview) paint the art as an
  // HTML `background-size: cover` layer BEHIND a frame-only SVG, instead of an
  // in-SVG `<image preserveAspectRatio="… slice">`. The slice path was left with
  // a white band below the art at rest (issue #373): the correctly-scaled image
  // raster was truncated at the bottom inside the clipPath group and only a
  // re-composite (hover/scroll) painted the missing strip. `background-size:
  // cover` fills deterministically, never depending on the compositor honoring
  // `slice`. `htmlArt` also switches the SVG's cream base to an even-odd ring so
  // the top-panel window is transparent and the art shows through.
  //
  // String-rendered board tokens (CardSvg used directly by cardFace.tsx) can't
  // carry an HTML layer, so they keep the all-SVG path (htmlArt off) — they've
  // never shown the band, and staying vector keeps them crisp under d3 zoom.
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          // Size the art layer to EXACTLY the top-panel window so `cover` scales
          // the image against the same box the old in-SVG `<image
          // preserveAspectRatio="xMidYMid slice">` used — the crop is then
          // mathematically identical to the original slice framing. Spanning a
          // larger box (e.g. the full inner card) would over-zoom, since only the
          // window is visible through the frame's transparent hole (issue #373).
          top: `${(conprops.outerBorderWidth / conprops.height) * 100}%`,
          left: `${(conprops.outerBorderWidth / conprops.width) * 100}%`,
          width: `${(props.topPanelWidth / conprops.width) * 100}%`,
          height: `${(roundNumber(props.topPanelHeight, 2) / conprops.height) * 100}%`,
          backgroundImage: `url("${props.dataUri}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          zIndex: 0,
        }}
      />
      {/* The frame SVG must paint ON TOP of the art layer. Both are painted in
          the wrapper's stacking context, and CSS paints positioned elements
          after in-flow ones — so the positioned art div would otherwise cover
          the frame. Positioning the SVG wrapper with a higher z-index keeps the
          borders, name banner, text, and black panel above the art. */}
      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%" }}>
        <CardSvg card={card} props={props} htmlArt />
      </div>
    </div>
  );
};

/**
 * The generated card face, layout pre-computed. Pure so it can also be
 * string-rendered (renderToStaticMarkup) into the d3 board canvas. Board
 * tokens pass idPrefix to keep clip-path ids unique inside the shared board
 * <svg> document, plus explicit width/height (percentages resolve against
 * the outer board viewport there, not the token group).
 */
export const CardSvg: React.FC<{
  card: DeckImportCardType;
  props: ReturnType<typeof calculateProps>;
  width?: string | number;
  height?: string | number;
  idPrefix?: string;
  /** Render the SVG as a FRAME ONLY (issue #373): the DOM renderer paints the
   * card art as an HTML `background-size: cover` layer behind this SVG, so here
   * we drop the in-SVG art `<image>` and the white top-panel rect, and turn the
   * cream base into an even-odd ring so the top-panel window is transparent and
   * the HTML art shows through. Left off (default) for string-rendered board
   * tokens, which keep the self-contained all-SVG art path. */
  htmlArt?: boolean;
}> = ({
  card,
  props,
  width = "100%",
  height = "100%",
  idPrefix = "",
  htmlArt = false,
}) => {
  const { width: W, height: H, cornerRadius: R, innerCornerRadius: r } = conprops;
  const b = conprops.outerBorderWidth;
  // Top-panel window (root svg coords), used by htmlArt to punch the art hole.
  const winR = b + props.topPanelWidth;
  const winB = b + roundNumber(props.topPanelHeight, 2);
  return (
    <Fragment>
      <svg
        preserveAspectRatio="xMinYMin meet"
        viewBox="0 0 63 88"
        shapeRendering="geometricPrecision"
        height={height}
        // HACK: width currently used to center the offset to right
        width={width}
        style={{ userSelect: "none" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <clipPath id={`${idPrefix}innerBorder`}>
          <rect
            width={props.innerWidth}
            height={conprops.height - 2 * conprops.outerBorderWidth}
            rx={conprops.innerCornerRadius}
          />
        </clipPath>
        <clipPath id={`${idPrefix}topPanel`}>
          <rect
            width={props.topPanelWidth}
            height={roundNumber(props.topPanelHeight, 2)}
          />
        </clipPath>
        {htmlArt ? (
          // Cream base with an even-odd hole punched at EXACTLY the top-panel
          // window (outer rounded rect minus the window), so only that window is
          // transparent and the HTML `background-size: cover` art layer behind
          // shows through. Everything else — the border, the cream hairline
          // divider below the art, and the area under the black panel — stays
          // cream, so no transparent seam can appear. The window's top corners
          // are rounded to the inner radius (matching the card's inner border);
          // its bottom edge is a straight internal line, exactly like the old
          // slice image's bottom.
          <path
            fillRule="evenodd"
            style={props.outerBorderStyle}
            d={
              `M${R},0 H${W - R} A${R},${R} 0 0 1 ${W},${R} V${H - R} ` +
              `A${R},${R} 0 0 1 ${W - R},${H} H${R} A${R},${R} 0 0 1 0,${H - R} ` +
              `V${R} A${R},${R} 0 0 1 ${R},0 Z ` +
              `M${b + r},${b} H${winR - r} A${r},${r} 0 0 1 ${winR},${b + r} ` +
              `V${winB} H${b} V${b + r} A${r},${r} 0 0 1 ${b + r},${b} Z`
            }
          />
        ) : (
          <rect
            width={conprops.width}
            height={conprops.height}
            rx={conprops.cornerRadius}
            style={props.outerBorderStyle}
          />
        )}
        <g
          transform={`translate(${conprops.outerBorderWidth} ${conprops.outerBorderWidth})`}
          clipPath={`url(#${idPrefix}innerBorder)`}
        >
          {/* Board tokens keep the in-SVG art (white top panel + slice image);
              the DOM renderer omits both and supplies an HTML cover-art layer. */}
          {!htmlArt && (
            <>
              <rect
                className="top-panel"
                width={props.topPanelWidth}
                height={roundNumber(props.topPanelHeight, 2)}
                style={cardStyles.topPanelStyle}
              />
              <image
                width={props.topPanelWidth}
                height={roundNumber(props.topPanelHeight, 2)}
                href={props.dataUri}
                clipPath={`url(#${idPrefix}topPanel)`}
                preserveAspectRatio="xMidYMid slice"
              />
            </>
          )}
          <polygon
            style={props.outerBorderStyle}
            points={`
              0,0 10,0 10,39.6 5,42.9 0,40.1
                `}
          />
          <polygon
            style={props.namePanel}
            points="0,14.2 10,14.2 10,39.87 5,42.77 0,39.9"
          />
          <text
            x="-20"
            y="7"
            textAnchor="end"
            transform="rotate(-90 0 0)"
            lengthAdjust="spacingAndGlyphs"
            textLength={props.cantonAdjust === 0 ? 23.5 : undefined}
            style={cardStyles.characterNameStyle}
          >
            {card.characterName}
          </text>
          <polygon
            className={card.type}
            points="0,0 10,0 10,14.2 5,17.1 0,14.2"
          />
          {!props.isScheme ? (
            <text
              x="5"
              y="14.8"
              textAnchor="middle"
              style={cardStyles.cardValueStyle}
            >
              {card.value}
            </text>
          ) : (
            ""
          )}
          {/* @ts-ignore */}
          <IconSvg
            //@ts-ignore
            cardType={card.type}
            width={6}
            x={5 - 6 / 2}
            y={1.5}
            fill={`#fff`}
          />
          <rect
            className="bottom-panel"
            width={props.bottomPanelWidth}
            height={props.bottomPanelHeight}
            y={props.bottomPanelY}
            style={cardStyles.bottomPanelStyle}
          />
          <text style={cardStyles.titleTextStyle} y={props.bottomPanelY} dy="6">
            {props.wrapCardTitle.map((line, index) => (
              <tspan key={index} x={conprops.bottomPanelPadding} dy="6">
                {line}
              </tspan>
            ))}
          </text>
          <line
            x1={conprops.bottomPanelPadding}
            y1={props.bottomPanelY + 1.5 + 6 * props.wrapCardTitle.length}
            x2={props.bottomPanelWidth - conprops.bottomPanelPadding}
            y2={props.bottomPanelY + 1.5 + 6 * props.wrapCardTitle.length}
            strokeWidth="0.4"
            stroke="#fff"
          />
          {card.basicText ? (
            <text
              style={props.bodyTextStyle}
              y={
                props.bottomPanelY +
                props.bodyTextStyle.fontSize * 0.8 +
                6 * props.wrapCardTitle.length
              }
            >
              {props.wrapBasicText.map((line, index) => (
                <tspan
                  dy={props.bodyTextStyle.fontSize * 1.1}
                  x={conprops.bottomPanelPadding}
                  key={index}
                >
                  {line}
                </tspan>
              ))}
            </text>
          ) : (
            ""
          )}

          {!props.isScheme && card.immediateText ? (
            <text
              style={props.bodyTextStyle}
              y={
                props.bottomPanelY +
                props.bodyTextStyle.fontSize * 0.8 +
                6 * props.wrapCardTitle.length +
                props.bodyTextStyle.fontSize * 1.1 * props.wrapBasicText.length
              }
            >
              <tspan
                dy={4.36}
                x={conprops.bottomPanelPadding}
                style={cardStyles.sectionHeadingStyle}
              >
                IMMEDIATELY:
              </tspan>
              {props.wrapImmediateText.map((line, index) => (
                <tspan
                  dy={index ? props.bodyTextStyle.fontSize * 1.1 : 0}
                  x={index ? conprops.bottomPanelPadding : undefined}
                  key={index}
                >
                  {line}
                </tspan>
              ))}
            </text>
          ) : (
            ""
          )}

          {!props.isScheme && card.duringText ? (
            <text
              style={props.bodyTextStyle}
              y={
                props.bottomPanelY +
                props.bodyTextStyle.fontSize * 0.8 +
                6 * props.wrapCardTitle.length +
                props.bodyTextStyle.fontSize *
                  1.1 *
                  (props.wrapBasicText.length + props.wrapImmediateText.length)
              }
            >
              <tspan
                dy={4.36}
                x={conprops.bottomPanelPadding}
                style={cardStyles.sectionHeadingStyle}
              >
                DURING COMBAT:
              </tspan>
              {props.wrapDuringText.map((line, index) => (
                <tspan
                  dy={index ? props.bodyTextStyle.fontSize * 1.1 : 0}
                  x={index ? conprops.bottomPanelPadding : undefined}
                  key={index}
                >
                  {line}
                </tspan>
              ))}
            </text>
          ) : (
            ""
          )}

          {!props.isScheme && card.afterText ? (
            <text
              style={props.bodyTextStyle}
              y={
                props.bottomPanelY +
                props.bodyTextStyle.fontSize * 0.8 +
                6 * props.wrapCardTitle.length +
                props.bodyTextStyle.fontSize *
                  1.1 *
                  (props.wrapBasicText.length +
                    props.wrapImmediateText.length +
                    props.wrapDuringText.length)
              }
            >
              <tspan
                dy={4.36}
                x={conprops.bottomPanelPadding}
                style={cardStyles.sectionHeadingStyle}
              >
                AFTER COMBAT:
              </tspan>
              {props.wrapAfterText.map((line, index) => (
                <tspan
                  dy={index ? props.bodyTextStyle.fontSize * 1.1 : 0}
                  x={index ? conprops.bottomPanelPadding : undefined}
                  key={index}
                >
                  {line}
                </tspan>
              ))}
            </text>
          ) : (
            ""
          )}

          {/* if boostValue */}
          {card.boost ? (
            <g>
              <circle
                r={conprops.boostCircleRadius}
                fill={conprops.outerBorderColour}
                cx="52"
                cy={props.bottomPanelY - 1}
              />
              <circle
                r={conprops.boostCircleRadius - conprops.hRuleThickness}
                fill="#000"
                cx={52}
                cy={props.bottomPanelY - 1}
              />
              <text
                x={52}
                y={props.bottomPanelY - 1}
                dy={1.5}
                textAnchor="middle"
                style={cardStyles.boostValueStyle}
              >
                {card.boost}
              </text>
            </g>
          ) : (
            ""
          )}

          <text
            x="52.5"
            y={conprops.height - 2 * conprops.outerBorderWidth - 1.5}
            textAnchor="end"
            style={cardStyles.bottomCornerStyle}
          >
            {card.title}
          </text>
          <line
            x1={53.25}
            y1={conprops.height - 2 * conprops.outerBorderWidth - 0.8}
            x2={53.25}
            y2={conprops.height - 2 * conprops.outerBorderWidth - 1.5 - 2.2}
            strokeWidth="0.3"
            stroke="#fff"
          />
          <text
            x="54"
            y={conprops.height - 2 * conprops.outerBorderWidth - 1.5}
            style={cardStyles.quantityStyle}
          >
            {card.quantity}
          </text>
        </g>
      </svg>
    </Fragment>
  );
};

export const CardFactory = memo(CardFactoryBase);
