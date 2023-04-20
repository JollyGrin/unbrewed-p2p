import {
  DeckImportCardType,
  UnmatchedCardType,
} from "../DeckPool/deck-import.type";
import { CardConstantsType } from "./card.type";
import { Canvas } from "canvas";

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
  topPanelHeight: (props: DeckImportCardType, canvas: Canvas) => {
    const topHeight =
      cardConstants.height -
      2 * cardConstants.outerBorderWidth -
      actions.bottomPanelHeight(props, canvas) -
      cardConstants.hRuleThickness;

    return topHeight;
  },
  bottomPanelWidth: () => {
    return actions.innerWidth();
  },
  bottomPanelY: (props: DeckImportCardType, canvas: Canvas) => {
    return actions.topPanelHeight(props, canvas) + cardConstants.hRuleThickness;
  },
  bottomPanelStyle: () => {
    return { fill: "#000" };
  },
  bottomPanelHeight: (props: DeckImportCardType, canvas: Canvas) => {
    const textHeight =
      actions.bodyTextStyle().fontSize * 0.8 +
      6 * actions.wrapCardTitle(props.title, canvas).length +
      actions.bodyTextStyle().fontSize *
        1.1 *
        (actions.isScheme(props.type)
          ? actions.wrapBasicText(props.basicText, canvas).length
          : actions.wrapBasicText(props.basicText, canvas).length +
            actions.wrapImmediateText(props.immediateText, canvas).length +
            actions.wrapDuringText(props.duringText, canvas).length +
            actions.wrapAfterText(props.afterText, canvas).length) +
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
  cantonAdjust: (characterName: string, canvas: Canvas) => {
    const width = actions.getTextWidth(
      characterName,
      "6px BebasNeueRegular",
      canvas
    );
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
      font: `${fontSize}px ArchivoNarrow`,
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
  wrapBasicText: (basicText: string, canvas: Canvas) => {
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
          actions.maxTextLength(),
          undefined,
          canvas
        );
      });
    return lines.flat();
  },
  wrapImmediateText: (immediateText: string, canvas: Canvas) => {
    if (!(immediateText && immediateText.trim())) {
      return [];
    }
    const indent = actions.getTextWidth(
      "IMMEDIATELY: ",
      actions.sectionHeadingStyle().font,
      canvas
    );

    const lines = immediateText
      .trim()
      .split(/\r?\n/)
      .map((line: string, index: number) => {
        return actions.wrapLines(
          line.split(" "),
          actions.bodyTextStyle().font,
          actions.maxTextLength(),
          index === 0 ? indent : 0,
          canvas
        );
      });
    return lines.flat();
  },
  wrapDuringText: (duringText: string, canvas: Canvas) => {
    if (!(duringText && duringText.trim())) {
      return [];
    }
    const indent = actions.getTextWidth(
      "DURING COMBAT: ",
      actions.sectionHeadingStyle().font,
      canvas
    );
    const lines = duringText
      .trim()
      .split(/\r?\n/)
      .map((line: string, index: number) => {
        return actions.wrapLines(
          line.split(" "),
          actions.bodyTextStyle().font,
          actions.maxTextLength(),
          index === 0 ? indent : 0,
          canvas
        );
      });
    return lines.flat();
  },
  wrapAfterText: (afterText: string, canvas: Canvas) => {
    if (!(afterText && afterText.trim())) {
      return [];
    }
    const indent = actions.getTextWidth(
      "AFTER COMBAT: ",
      actions.sectionHeadingStyle().font,
      canvas
    );
    const lines = afterText
      .trim()
      .split(/\r?\n/)
      .map((line: string, index: number) => {
        return actions.wrapLines(
          line.split(" "),
          actions.bodyTextStyle().font,
          actions.maxTextLength(),
          index === 0 ? indent : 0,
          canvas
        );
      });
    return lines.flat();
  },
  wrapCardTitle: (title: string, canvas: Canvas) => {
    return actions.wrapLines(
      title?.split(" "),
      actions.titleTextStyle().font,
      actions.maxTextLength(),
      undefined,
      canvas
    );
  },
  wrapLines: (
    words: string[],
    font: string,
    maxLength: number,
    indent = 0,
    canvas: Canvas
  ): string[] => {
    var line = "";
    var i;
    for (i = 0; i < words?.length; i++) {
      line = words.slice(0, words.length - i).join(" ");
      if (actions.getTextWidth(line, font, canvas) <= maxLength - indent) break;
    }
    const remainingWords =
      i === words?.length ? words?.slice(1) : words?.slice(words.length - i);
    if (i && remainingWords.length) {
      return [
        line,
        ...actions.wrapLines(
          remainingWords,
          font,
          maxLength,
          undefined,
          canvas
        ),
      ];
    }
    return [line];
  },
  maxTextLength: () => {
    return actions.bottomPanelWidth() - 2 * cardConstants.bottomPanelPadding;
  },
  getTextWidth: (text: string, font: string, canvas: Canvas) => {
    if (!canvas) return 10;
    const context = canvas.getContext("2d");
    context.font = font;
    const width = context.measureText(text).width;
    return width;
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
      fontFamily: "LeagueGothic",
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

export const calculateProps = (card: DeckImportCardType, canvas: Canvas) => ({
  isScheme: actions.isScheme(card.type),
  topPanelWidth: actions.topPanelWidth(),
  topPanelHeight: actions.topPanelHeight(card, canvas),
  bottomPanelWidth: actions.bottomPanelWidth(),
  bottomPanelHeight: actions.bottomPanelHeight(card, canvas),
  bottomPanelY: actions.bottomPanelY(card, canvas),
  innerWidth: actions.innerWidth(),
  namePanel: actions.namePanel(),
  dataUri: imageUri(card.imageUrl),
  outerBorderStyle: actions.outerBorderStyle(),
  cantonAdjust: actions.cantonAdjust(card.characterName, canvas),
  wrapCardTitle: actions.wrapCardTitle(card.title, canvas),
  wrapBasicText: actions.wrapBasicText(card.basicText, canvas),
  wrapDuringText: actions.wrapDuringText(card.duringText, canvas),
  wrapImmediateText: actions.wrapImmediateText(card.immediateText, canvas),
  wrapAfterText: actions.wrapAfterText(card.afterText, canvas),
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
    fontFamily: "LeagueGothic",
    fontSize: "1.8px",
  },
  cardValueStyle: {
    fill: "#fff",
    fontFamily: "BebasNeueRegular",
    fontSize: "7.8px",
  },
};
