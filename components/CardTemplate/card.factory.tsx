import { Fragment } from "react";
import { DeckImportCardType } from "../DeckPool/deck-import.type";
import {
  calculateProps,
  cardStyles,
  cardConstants as conprops,
  roundNumber,
} from "./card.helpers";

export const CardFactory: React.FC<{ card: DeckImportCardType }> = ({
  card,
}) => {
  console.log({ card });
  const props = calculateProps(card);

  return (
    <Fragment>
      <svg
        preserveAspectRatio="xMinYMin meet"
        viewBox="0 0 63 88"
        shapeRendering="geometricPrecision"
      >
        <clipPath id="innerBorder">
          <rect
            width={props.innerWidth}
            height={conprops.height - 2 * conprops.outerBorderWidth}
            rx={conprops.innerCornerRadius}
          />
        </clipPath>
        <clipPath id="topPanel">
          <rect
            width={props.topPanelWidth}
            height={roundNumber(props.topPanelHeight, 2)}
          />
        </clipPath>
        <rect
          width={conprops.width}
          height={conprops.height}
          rx={conprops.cornerRadius}
          style={props.outerBorderStyle}
        />
        <g
          transform={`translate(${conprops.outerBorderWidth} ${conprops.outerBorderWidth})`}
          clipPath={`url(#innerBorder)`}
        >
          <rect
            className="top-panel"
            width={props.topPanelWidth}
            height={props.topPanelHeight}
            style={cardStyles.topPanelStyle}
          />
          <image
            width={props.topPanelWidth}
            href={props.dataUri}
            clipPath="url(#topPanel)"
            preserveAspectRatio="xMidYMid meet"
          />
          <polygon
            style={props.outerBorderStyle}
            points={`
              0,0 10.8,0 10.8,39.6 5,42.9 0,40.1
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
          {/* <IconSvg
            cardType={card.type}
            width={6}
            x={5 - 6 / 2}
            y={1.5}
            fill={`#fff`}
          /> */}
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
