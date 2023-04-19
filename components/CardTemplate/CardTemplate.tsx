//@ts-nocheck
import React, { Component, Fragment } from "react";
import cardMock from "../../assets/mock/card.json";
import IconSvg from "./IconSvg";
import dynamic from "next/dynamic";

export default class CardTemplate extends Component {
  constructor(props) {
    super(props);
  }

  cardProp = {
    afterText: this.props.card.afterText,
    basicText: this.props.card.basicText,
    boost: this.props.card.boost,
    characterName: this.props.card.characterName,
    duringText: this.props.card.duringText,
    imageUrl: this.props.card.imageUrl,
    immediateText: this.props.card.immediateText,
    quantity: this.props.card.quantity,
    title: this.props.card.title,
    type: this.props.card.type,
    value: this.props.card.value,
  };

  cardDetails = {
    height: 88,
    width: 63,
    bottomPanelPadding: 3,
    outerBorderWidth: 3,
    innerCornerRadius: 1.5,
    cornerRadius: 2.5,
    hRuleThickness: 0.8,
    bottomPanelPadding: 3,
    outerBorderColour: "#f7eadb",
    boostCircleRadius: 3.75,
  };

  asyncActions = {
    dataUri: () => {
      if (this.cardProp.imageUrl) {
        return this.cardProp.imageUrl;
      }
      return "https://picsum.photos/300";
    },
  };

  roundNumber = (number, roundTo) => {
    const round = +number.toFixed(roundTo);
    return round;
  };

  actions = {
    innerWidth: () => {
      return this.cardDetails.width - 2 * this.cardDetails.outerBorderWidth;
    },
    topPanelWidth: () => {
      return this.actions.innerWidth();
    },
    topPanelHeight: () => {
      const topHeight =
        this.cardDetails.height -
        2 * this.cardDetails.outerBorderWidth -
        this.actions.bottomPanelHeight() -
        this.cardDetails.hRuleThickness;

      return topHeight;
    },
    bottomPanelWidth: () => {
      return this.actions.innerWidth();
    },
    bottomPanelY: () => {
      return this.actions.topPanelHeight() + this.cardDetails.hRuleThickness;
    },
    bottomPanelStyle: () => {
      return { fill: "#000" };
    },
    bottomPanelHeight: () => {
      const textHeight =
        this.actions.bodyTextStyle().fontSize * 0.8 +
        6 * this.actions.wrapCardTitle().length +
        this.actions.bodyTextStyle().fontSize *
          1.1 *
          (this.actions.isScheme()
            ? this.actions.wrapBasicText().length
            : this.actions.wrapBasicText().length +
              this.actions.wrapImmediateText().length +
              this.actions.wrapDuringText().length +
              this.actions.wrapAfterText().length) +
        5;
      return Math.max(28.8, textHeight);
    },
    namePanel: () => {
      return {
        fill: "#000",
      };
    },
    characterNameStyle: () => {
      return {
        fill: "#fff",
        fontSize: "BebasNeueRegular",
        fontSize: "6px",
      };
    },
    cantonAdjust: () => {
      const width = this.actions.getTextWidth(
        this.cardProp.characterName,
        "6px BebasNeueRegular"
      );
      const adjust = width - 22.1;
      return adjust < 0 ? adjust : 0;
    },
    outerBorderStyle: () => {
      return {
        fill: this.cardDetails.outerBorderColour,
      };
    },
    topPanelStyle: () => {
      return { fill: "#fff" };
    },
    titleTextStyle: () => {
      const fontSize = 5;
      return {
        fill: "#fff",
        font: `${fontSize}px BebasNeueRegular`,
        fontSize,
      };
    },
    bodyTextStyle: () => {
      const fontSize = 3.3;
      return {
        fill: "#fff",
        font: `${fontSize}px Archivo Narrow`,
        fontSize,
      };
    },
    titleTextStyle: () => {
      const fontSize = 5;
      return {
        fill: "#fff",
        font: `${fontSize}px BebasNeueRegular`,
        fontSize,
      };
    },
    sectionHeadingStyle: () => {
      const fontSize = 4;
      return {
        fill: "#fff",
        font: `${fontSize}px BebasNeueRegular`,
        fontSize,
      };
    },
    wrapBasicText: () => {
      if (!(this.cardProp.basicText && this.cardProp.basicText.trim())) {
        return [];
      }
      const lines = this.cardProp.basicText
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          return this.actions.wrapLines(
            line.split(" "),
            this.actions.bodyTextStyle().font,
            this.actions.maxTextLength()
          );
        });
      return lines.flat();
    },
    wrapImmediateText: () => {
      if (
        !(this.cardProp.immediateText && this.cardProp.immediateText.trim())
      ) {
        return [];
      }
      const indent = this.actions.getTextWidth(
        "IMMEDIATELY: ",
        this.actions.sectionHeadingStyle().font
      );

      const lines = this.cardProp.immediateText
        .trim()
        .split(/\r?\n/)
        .map((line, index) => {
          return this.actions.wrapLines(
            line.split(" "),
            this.actions.bodyTextStyle().font,
            this.actions.maxTextLength(),
            index === 0 ? indent : 0
          );
        });
      return lines.flat();
    },
    wrapDuringText: () => {
      if (!(this.cardProp.duringText && this.cardProp.duringText.trim())) {
        return [];
      }
      const indent = this.actions.getTextWidth(
        "DURING COMBAT: ",
        this.actions.sectionHeadingStyle().font
      );
      const lines = this.cardProp.duringText
        .trim()
        .split(/\r?\n/)
        .map((line, index) => {
          return this.actions.wrapLines(
            line.split(" "),
            this.actions.bodyTextStyle().font,
            this.actions.maxTextLength(),
            index === 0 ? indent : 0
          );
        });
      return lines.flat();
    },
    wrapAfterText: () => {
      if (!(this.cardProp.afterText && this.cardProp.afterText.trim())) {
        return [];
      }
      const indent = this.actions.getTextWidth(
        "AFTER COMBAT: ",
        this.actions.sectionHeadingStyle().font
      );
      const lines = this.cardProp.afterText
        .trim()
        .split(/\r?\n/)
        .map((line, index) => {
          return this.actions.wrapLines(
            line.split(" "),
            this.actions.bodyTextStyle().font,
            this.actions.maxTextLength(),
            index === 0 ? indent : 0
          );
        });
      return lines.flat();
    },
    wrapCardTitle: () => {
      return this.actions.wrapLines(
        this.cardProp.title.split(" "),
        this.actions.titleTextStyle().font,
        this.actions.maxTextLength()
      );
    },
    wrapLines: (words, font, maxLength, indent = 0) => {
      var line = "";
      var i;
      for (i = 0; i < words.length; i++) {
        line = words.slice(0, words.length - i).join(" ");
        if (this.actions.getTextWidth(line, font) <= maxLength - indent) break;
      }
      const remainingWords =
        i === words.length ? words.slice(1) : words.slice(words.length - i);
      if (i && remainingWords.length) {
        return [
          line,
          ...this.actions.wrapLines(remainingWords, font, maxLength),
        ];
      }
      return [line];
    },
    maxTextLength: () => {
      return (
        this.actions.bottomPanelWidth() -
        2 * this.cardDetails.bottomPanelPadding
      );
    },
    getTextWidth: (text, font) => {
      console.log("text/font", text, font);
      // const canvas = createCanvas(200, 200);
      // const context = canvas.getContext("2d");
      // if (typeof window === "undefined") return;
      // const canvas = window.document.createElement("canvas");
      // const context = canvas.getContext("2d");
      // context.font = font;
      // console.log({ context }, context.measureText(text).width);
      // return context.measureText(text).width;
      // return 10;
      // console.log({ font });
      return 10;
    },
    boostValueStyle: () => {
      return {
        fill: "#fff",
        fontFamily: "BebasNeueRegular",
        fontSize: "5px",
      };
    },
    bottomCornerStyle: () => {
      return {
        fill: "#fff",
        fontFamily: "BebasNeueRegular",
        fontSize: "1.8px",
      };
    },
    cardValueStyle: () => {
      return {
        fill: "#fff",
        fontFamily: "BebasNeueRegular",
        fontSize: "7.8px",
      };
    },
    quantityStyle: () => {
      return {
        fill: "#fff",
        fontFamily: "League Gothic",
        fontSize: "1.8px",
      };
    },
    isScheme: () => {
      return this.cardProp.type === "scheme";
    },
  };

  render() {
    const {
      width,
      height,
      outerBorderWidth,
      innerCornerRadius,
      cornerRadius,
      outerBorderStyle,
      bottomPanelPadding,
      boostCircleRadius,
      outerBorderColour,
      hRuleThickness,
    } = this.cardDetails;

    const {
      afterText,
      basicText,
      boost,
      characterName,
      duringText,
      imageUrl,
      immediateText,
      quantity,
      title,
      type,
      value,
    } = this.cardProp;

    const styles = {
      topPanelStyle: this.actions.topPanelStyle(),
    };

    const isScheme = this.actions.isScheme();
    const topPanelWidth = this.actions.topPanelWidth();
    const topPanelHeight = this.actions.topPanelHeight();
    const bottomPanelWidth = this.actions.bottomPanelWidth();
    const bottomPanelHeight = this.actions.bottomPanelHeight();
    const bottomPanelY = this.actions.bottomPanelY();
    const innerWidth = this.actions.innerWidth();
    const namePanel = this.actions.namePanel();
    const dataUri = this.asyncActions.dataUri();
    const cantonAdjust = this.actions.cantonAdjust();
    const wrapCardTitle = this.actions.wrapCardTitle();
    const wrapBasicText = this.actions.wrapBasicText();
    const wrapDuringText = this.actions.wrapDuringText();
    const wrapImmediateText = this.actions.wrapImmediateText();
    const wrapAfterText = this.actions.wrapAfterText();
    const bodyTextStyle = this.actions.bodyTextStyle();

    const topPanelStyle = { fill: "#fff" };
    const bottomPanelStyle = { fill: "#000" };
    const characterNameStyle = {
      fill: "#fff",
      fontFamily: "BebasNeueRegular",
      fontSize: "6px",
    };
    const titleTextStyle = {
      fill: "#fff",
      fontFamily: `BebasNeueRegular`,
      fontSize: `5px`,
    };
    const sectionHeadingStyle = {
      fill: "#fff",
      fontFamily: `BebasNeueRegular`,
      fontSize: `4px`,
      fsize: 4,
    };
    const boostValueStyle = {
      fill: "#fff",
      fontFamily: "BebasNeueRegular",
      fontSize: 5,
    };
    const bottomCornerStyle = {
      fill: "#fff",
      fontFamily: "BebasNeueRegular",
      fontSize: "1.8px",
    };
    const quantityStyle = {
      fill: "#fff",
      fontFamily: "League Gothic",
      fontSize: "1.8px",
    };
    const cardValueStyle = {
      fill: "#fff",
      fontFamily: "BebasNeueRegular",
      fontSize: "7.8px",
    };

    return (
      <Fragment>
        <svg
          preserveAspectRatio="xMinYMin meet"
          ref="svg"
          viewBox="0 0 63 88"
          shapeRendering="geometricPrecision"
        >
          <clipPath id="innerBorder">
            <rect
              width={innerWidth}
              height={height - 2 * outerBorderWidth}
              rx={innerCornerRadius}
            />
          </clipPath>
          <clipPath id="topPanel">
            <rect
              width={topPanelWidth}
              height={this.roundNumber(topPanelHeight, 2)}
            />
          </clipPath>
          <rect
            width={width}
            height={height}
            rx={cornerRadius}
            style={outerBorderStyle}
          />
          <g
            transform={`translate(${outerBorderWidth} ${outerBorderWidth})`}
            clipPath={`url(#innerBorder)`}
          >
            <rect
              className="top-panel"
              width={topPanelWidth}
              height={topPanelHeight}
              style={topPanelStyle}
            />
            <image
              width={topPanelWidth}
              href={dataUri}
              clipPath="url(#topPanel)"
              preserveAspectRatio="xMidYMid meet"
            />
            <polygon
              style={outerBorderStyle}
              points={`
              0,0 10.8,0 10.8,39.6 5,42.9 0,40.1
                `}
            />
            {/* old dynamic polygons that stretch */}
            {/* <polygon
              style={outerBorderStyle}
              points={`
                    0,0 10.8,0 10.8,${43.7 + cantonAdjust} 5,${47 +
                cantonAdjust} 0,${44.2 + cantonAdjust}
                `}
            /> */}
            {/* <polygon
              style={namePanel}
              points={`0,14.2 10,14.2 10,${43.3 + cantonAdjust} 5,${46.2 +
                cantonAdjust} 0,${43.3 + cantonAdjust}`}
            /> */}
            <polygon
              style={namePanel}
              points="0,14.2 10,14.2 10,39.87 5,42.77 0,39.9"
            />
            <text
              x="-20"
              y="7"
              textAnchor="end"
              transform="rotate(-90 0 0)"
              lengthAdjust="spacingAndGlyphs"
              textLength={cantonAdjust === 0 ? 23.5 : null}
              style={characterNameStyle}
            >
              {this.cardProp.characterName}
            </text>
            <polygon className={type} points="0,0 10,0 10,14.2 5,17.1 0,14.2" />
            {!this.actions.isScheme() ? (
              <text x="5" y="14.8" textAnchor="middle" style={cardValueStyle}>
                {value}
              </text>
            ) : (
              ""
            )}
            <IconSvg
              cardType={this.cardProp.type}
              width={6}
              x={5 - 6 / 2}
              y={1.5}
              fill={`#fff`}
            />
            <rect
              className="bottom-panel"
              width={bottomPanelWidth}
              height={bottomPanelHeight}
              y={bottomPanelY}
              style={bottomPanelStyle}
            />
            <text style={titleTextStyle} y={bottomPanelY} dy="6">
              {wrapCardTitle.map((line, index) => (
                <tspan key={index} x={bottomPanelPadding} dy="6">
                  {line}
                </tspan>
              ))}
            </text>
            <line
              x1={bottomPanelPadding}
              y1={bottomPanelY + 1.5 + 6 * wrapCardTitle.length}
              x2={bottomPanelWidth - bottomPanelPadding}
              y2={bottomPanelY + 1.5 + 6 * wrapCardTitle.length}
              strokeWidth="0.4"
              stroke="#fff"
            />
            {basicText ? (
              <text
                style={bodyTextStyle}
                y={
                  bottomPanelY +
                  bodyTextStyle.fontSize * 0.8 +
                  6 * wrapCardTitle.length
                }
              >
                {wrapBasicText.map((line, index) => (
                  <tspan
                    dy={bodyTextStyle.fontSize * 1.1}
                    x={bottomPanelPadding}
                    key={index}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            ) : (
              ""
            )}

            {!isScheme && immediateText ? (
              <text
                style={bodyTextStyle}
                y={
                  bottomPanelY +
                  bodyTextStyle.fontSize * 0.8 +
                  6 * wrapCardTitle.length +
                  bodyTextStyle.fontSize * 1.1 * wrapBasicText.length
                }
              >
                <tspan
                  dy={4.36}
                  x={bottomPanelPadding}
                  style={sectionHeadingStyle}
                >
                  IMMEDIATELY:
                </tspan>
                {wrapImmediateText.map((line, index) => (
                  <tspan
                    dy={index ? bodyTextStyle.fontSize * 1.1 : 0}
                    x={index ? bottomPanelPadding : null}
                    key={index}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            ) : (
              ""
            )}

            {!isScheme && duringText ? (
              <text
                style={bodyTextStyle}
                y={
                  bottomPanelY +
                  bodyTextStyle.fontSize * 0.8 +
                  6 * wrapCardTitle.length +
                  bodyTextStyle.fontSize *
                    1.1 *
                    (wrapBasicText.length + wrapImmediateText.length)
                }
              >
                <tspan
                  dy={4.36}
                  x={bottomPanelPadding}
                  style={sectionHeadingStyle}
                >
                  DURING COMBAT:
                </tspan>
                {wrapDuringText.map((line, index) => (
                  <tspan
                    dy={index ? bodyTextStyle.fontSize * 1.1 : 0}
                    x={index ? bottomPanelPadding : null}
                    key={index}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            ) : (
              ""
            )}

            {!isScheme && afterText ? (
              <text
                style={bodyTextStyle}
                y={
                  bottomPanelY +
                  bodyTextStyle.fontSize * 0.8 +
                  6 * wrapCardTitle.length +
                  bodyTextStyle.fontSize *
                    1.1 *
                    (wrapBasicText.length +
                      wrapImmediateText.length +
                      wrapDuringText.length)
                }
              >
                <tspan
                  dy={4.36}
                  x={bottomPanelPadding}
                  style={sectionHeadingStyle}
                >
                  AFTER COMBAT:
                </tspan>
                {wrapAfterText.map((line, index) => (
                  <tspan
                    dy={index ? bodyTextStyle.fontSize * 1.1 : 0}
                    x={index ? bottomPanelPadding : null}
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
            {boost ? (
              <g>
                <circle
                  r={boostCircleRadius}
                  fill={outerBorderColour}
                  cx="52"
                  cy={bottomPanelY - 1}
                />
                <circle
                  r={boostCircleRadius - hRuleThickness}
                  fill="#000"
                  cx={52}
                  cy={bottomPanelY - 1}
                />
                <text
                  x={52}
                  y={bottomPanelY - 1}
                  dy={1.5}
                  textAnchor="middle"
                  style={boostValueStyle}
                >
                  {boost}
                </text>
              </g>
            ) : (
              ""
            )}

            <text
              x="52.5"
              y={height - 2 * outerBorderWidth - 1.5}
              textAnchor="end"
              style={bottomCornerStyle}
            >
              {title}
            </text>
            <line
              x1={53.25}
              y1={height - 2 * outerBorderWidth - 0.8}
              x2={53.25}
              y2={height - 2 * outerBorderWidth - 1.5 - 2.2}
              strokeWidth="0.3"
              stroke="#fff"
            />
            <text
              x="54"
              y={height - 2 * outerBorderWidth - 1.5}
              style={quantityStyle}
            >
              {quantity}
            </text>
          </g>
        </svg>
      </Fragment>
    );
  }
}
