import {
  DeckImportCardType,
  UnmatchedCardType,
} from "../DeckPool/deck-import.type";
import { CardConstantsType } from "./card.type";

export const cardConstants: CardConstantsType = {
  height: 88,
  width: 63,
  bottomPanelPadding: 3,
  outerBorderWidth: 3,
  innerCornerRadius: 1.5,
  cornerRadius: 2.5,
  hRuleThickness: 0.8,
  outerBorderColour: "#f7eadb",
  boostCircleRadius: 3.75,
};

export const actions = {
  innerWidth: () => {
    return cardConstants.width - 2 * cardConstants.outerBorderWidth;
  },
  topPanelWidth: () => {
    return actions.innerWidth();
  },
  topPanelHeight: (props: DeckImportCardType) => {
    const topHeight =
      cardConstants.height -
      2 * cardConstants.outerBorderWidth -
      actions.bottomPanelHeight(props) -
      cardConstants.hRuleThickness;

    return topHeight;
  },
  bottomPanelWidth: () => {
    return actions.innerWidth();
  },
  bottomPanelY: (props: DeckImportCardType) => {
    return actions.topPanelHeight(props) + cardConstants.hRuleThickness;
  },
  bottomPanelStyle: () => {
    return { fill: "#000" };
  },
  bottomPanelHeight: (props: DeckImportCardType) => {
    const textHeight =
      actions.bodyTextStyle().fontSize * 0.8 +
      6 * actions.wrapCardTitle(props.title).length +
      actions.bodyTextStyle().fontSize *
        1.1 *
        (actions.isScheme(props.type)
          ? actions.wrapBasicText(props.basicText).length
          : actions.wrapBasicText(props.basicText).length +
            actions.wrapImmediateText(props.immediateText).length +
            actions.wrapDuringText(props.duringText).length +
            actions.wrapAfterText(props.afterText).length) +
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
      fontFamily: "BebasNeueRegular",
      fontSize: "6px",
    };
  },
  cantonAdjust: (characterName: string) => {
    const width = actions.getTextWidth(characterName, "6px BebasNeueRegular");
    const adjust = width - 22.1;
    return adjust < 0 ? adjust : 0;
  },
  outerBorderStyle: () => {
    return {
      fill: cardConstants.outerBorderColour,
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
  sectionHeadingStyle: () => {
    const fontSize = 4;
    return {
      fill: "#fff",
      font: `${fontSize}px BebasNeueRegular`,
      fontSize,
    };
  },
  wrapBasicText: (basicText: string) => {
    if (!(basicText && basicText.trim())) {
      return [];
    }
    const lines = basicText
      .trim()
      .split(/\r?\n/)
      .map((line: string) => {
        return actions.wrapLines(
          line.split(" "),
          actions.bodyTextStyle().font,
          actions.maxTextLength()
        );
      });
    return lines.flat();
  },
  wrapImmediateText: (immediateText: string) => {
    if (!(immediateText && immediateText.trim())) {
      return [];
    }
    const indent = actions.getTextWidth(
      "IMMEDIATELY: ",
      actions.sectionHeadingStyle().font
    );

    const lines = immediateText
      .trim()
      .split(/\r?\n/)
      .map((line: string, index: number) => {
        return actions.wrapLines(
          line.split(" "),
          actions.bodyTextStyle().font,
          actions.maxTextLength(),
          index === 0 ? indent : 0
        );
      });
    return lines.flat();
  },
  wrapDuringText: (duringText: string) => {
    if (!(duringText && duringText.trim())) {
      return [];
    }
    const indent = actions.getTextWidth(
      "DURING COMBAT: ",
      actions.sectionHeadingStyle().font
    );
    const lines = duringText
      .trim()
      .split(/\r?\n/)
      .map((line: string, index: number) => {
        return actions.wrapLines(
          line.split(" "),
          actions.bodyTextStyle().font,
          actions.maxTextLength(),
          index === 0 ? indent : 0
        );
      });
    return lines.flat();
  },
  wrapAfterText: (afterText: string) => {
    if (!(afterText && afterText.trim())) {
      return [];
    }
    const indent = actions.getTextWidth(
      "AFTER COMBAT: ",
      actions.sectionHeadingStyle().font
    );
    const lines = afterText
      .trim()
      .split(/\r?\n/)
      .map((line: string, index: number) => {
        return actions.wrapLines(
          line.split(" "),
          actions.bodyTextStyle().font,
          actions.maxTextLength(),
          index === 0 ? indent : 0
        );
      });
    return lines.flat();
  },
  wrapCardTitle: (title: string) => {
    return actions.wrapLines(
      title?.split(" "),
      actions.titleTextStyle().font,
      actions.maxTextLength()
    );
  },
  wrapLines: (
    words: string[],
    font: string,
    maxLength: number,
    indent = 0
  ): string[] => {
    var line = "";
    var i;
    for (i = 0; i < words?.length; i++) {
      line = words.slice(0, words.length - i).join(" ");
      if (actions.getTextWidth(line, font) <= maxLength - indent) break;
    }
    const remainingWords =
      i === words?.length ? words?.slice(1) : words?.slice(words.length - i);
    if (i && remainingWords.length) {
      return [line, ...actions.wrapLines(remainingWords, font, maxLength)];
    }
    return [line];
  },
  maxTextLength: () => {
    return actions.bottomPanelWidth() - 2 * cardConstants.bottomPanelPadding;
  },
  getTextWidth: (text: string, font: string) => {
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
  isScheme: (type: UnmatchedCardType) => {
    return type === "scheme";
  },
};
export const imageUri = (imageUrl: string | undefined) => {
  return imageUrl ?? "https://picsum.photos/300";
};

export const roundNumber = (number: number, roundTo: number) => {
  const round = +number.toFixed(roundTo);
  return round;
};

export const calculateProps = (card: DeckImportCardType) => ({
  isScheme: actions.isScheme(card.type),
  topPanelWidth: actions.topPanelWidth(),
  topPanelHeight: actions.topPanelHeight(card),
  bottomPanelWidth: actions.bottomPanelWidth(),
  bottomPanelHeight: actions.bottomPanelHeight(card),
  bottomPanelY: actions.bottomPanelY(card),
  innerWidth: actions.innerWidth(),
  namePanel: actions.namePanel(),
  dataUri: imageUri(card.imageUrl),
  outerBorderStyle: actions.outerBorderStyle(),
  cantonAdjust: actions.cantonAdjust(card.characterName),
  wrapCardTitle: actions.wrapCardTitle(card.title),
  wrapBasicText: actions.wrapBasicText(card.basicText),
  wrapDuringText: actions.wrapDuringText(card.duringText),
  wrapImmediateText: actions.wrapImmediateText(card.immediateText),
  wrapAfterText: actions.wrapAfterText(card.afterText),
  bodyTextStyle: actions.bodyTextStyle(),
});

export const cardStyles = {
  topPanelStyle: { fill: "#fff" },
  bottomPanelStyle: { fill: "#000" },
  characterNameStyle: {
    fill: "#fff",
    fontFamily: "BebasNeueRegular",
    fontSize: "6px",
  },
  titleTextStyle: {
    fill: "#fff",
    fontFamily: `BebasNeueRegular`,
    fontSize: `5px`,
  },
  sectionHeadingStyle: {
    fill: "#fff",
    fontFamily: `BebasNeueRegular`,
    fontSize: `4px`,
    fsize: 4,
  },
  boostValueStyle: {
    fill: "#fff",
    fontFamily: "BebasNeueRegular",
    fontSize: 5,
  },
  bottomCornerStyle: {
    fill: "#fff",
    fontFamily: "BebasNeueRegular",
    fontSize: "1.8px",
  },
  quantityStyle: {
    fill: "#fff",
    fontFamily: "League Gothic",
    fontSize: "1.8px",
  },
  cardValueStyle: {
    fill: "#fff",
    fontFamily: "BebasNeueRegular",
    fontSize: "7.8px",
  },
};
