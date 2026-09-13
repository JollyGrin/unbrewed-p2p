import {
  AnimationPlaybackControls,
  MotionValue,
  animate,
  cubicBezier,
  motion,
  useIsomorphicLayoutEffect,
  useMotionValue,
  useTransform,
} from "framer-motion";
import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { CardBack } from "@/components/CardFactory/card.back";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import {
  AnchorRect,
  findAnchor,
  resolveAnchor,
  screenCentre,
} from "@/lib/irl/irlAnchors";
import { IrlFxEvent, IrlFxMoved, useIrlFx } from "@/lib/irl/irlFx";
import {
  IRL_MOTION,
  useIrlFxPause,
  useIrlReducedMotion,
} from "@/lib/irl/irlMotion";
import { CARD_ASPECT, CardFace } from "./irl.ui";

/**
 * IRL Mode's card flights (issue #811): cards physically travel between the
 * piles. Every flight is a reaction to an fx event (lib/irl/irlFx) — the
 * layer never reads the pool — drawn as a ghost card that leaves its source's
 * `data-irl-anchor` (lib/irl/irlAnchors) and lands on its target's.
 *
 * - The source rect is read in the fx subscriber, synchronously, before the
 *   re-render that moves the card away; the target once the move has
 *   rendered, so a sheet that closed with the move no longer hides it.
 * - A pile tile a card is flying to holds its old count until the card lands
 *   ({@link useLandedCount}), so its tick and pulse (#810) follow the landing.
 * - Ghosts are `pointer-events: none`, capped at `maxGhosts`, and each one
 *   unmounts on landing — or on a safety timer, so nothing is ever stuck.
 * - Reduced motion: no ghost is mounted at all.
 */

type Face = "face" | "back";
type Window = readonly [number, number];

/** One card in the air, as an event plans it. */
export type FlightPlan = {
  /** travel from → to; dissolve in place (remove); fan on the deck (shuffle) */
  kind: "flight" | "dissolve" | "riffle";
  card?: DeckImportCardType;
  /** a riffle's three backs */
  cards?: DeckImportCardType[];
  /** anchor chains, first on screen wins — an empty `to` is the screen centre */
  from: string[];
  to: string[];
  /** the side showing as it leaves, and as it lands */
  faces: [Face, Face];
  /** the stretch of the trip the card turns over in */
  turn?: Window;
  /** fades out from IRL_MOTION.flight.fadeAt, into its pile */
  fade?: boolean;
  /** the bottom of the deck: slides under the tile instead of onto it */
  under?: boolean;
  /** seconds after the event */
  delay: number;
  /** the pile tile that holds its count until this card lands */
  lands?: string;
};

const { flight } = IRL_MOTION;
const EN_ROUTE: Window = flight.turnEnRoute;

/** a hand card: in the grid, on the tray / card view, else the Hand tile */
const handFrom = (index?: number) => [
  ...(index === undefined ? [] : [`hand-grid-card-${index}`]),
  "hand-card",
  "hand-tile",
];
const discardFrom = (index?: number) => [
  ...(index === undefined ? [] : [`discard-row-${index}`]),
  "discard-tile",
];
/** the in-play spread: the main card, then each boost */
const inPlayFrom = (i: number) =>
  i === 0 ? ["in-play-card"] : [`boost-slot-${i - 1}`, "in-play-card"];

/**
 * What an event sends flying. Pure: events in, plans out — `reveal`, `hide`
 * and `hp` belong to tickets 1 and 2 and fly nothing.
 */
export const planFlights = (
  event: IrlFxEvent,
  { cards, index }: IrlFxMoved,
): FlightPlan[] => {
  const card = cards[0];
  /** `n` cards, each `gap` seconds after the last */
  const each = (
    n: number,
    gap: number,
    make: (i: number) => Omit<FlightPlan, "delay">,
  ): FlightPlan[] =>
    Array.from({ length: n }, (_, i) => ({ ...make(i), delay: i * gap }));

  switch (event.type) {
    case "draw":
      return each(event.count, flight.stagger, (i) => ({
        kind: "flight",
        card: cards[i],
        from: ["deck-tile"],
        to: ["hand-card", "hand-tile"],
        faces: ["back", "face"],
      }));
    case "deal":
      // after `dealLead`: a Reset's dialog is still fading off the tray
      return each(event.count, flight.dealStagger, (i) => ({
        kind: "flight",
        card: cards[i],
        from: ["deck-tile"],
        to: ["hand-tile"],
        faces: ["back", "back"],
        lands: "hand-tile",
      })).map((plan) => ({ ...plan, delay: plan.delay + flight.dealLead }));
    case "play":
      return [
        {
          kind: "flight",
          card,
          from: handFrom(index),
          to: [],
          faces: ["face", "back"],
          turn: EN_ROUTE,
          fade: true,
          delay: 0,
        },
      ];
    case "discard":
      return event.from === "hand"
        ? [
            {
              kind: "flight",
              card,
              from: handFrom(index),
              to: ["discard-tile"],
              faces: ["face", "face"],
              fade: true,
              delay: 0,
              lands: "discard-tile",
            },
          ]
        : each(event.count, flight.stagger, (i) => ({
            kind: "flight",
            card: cards[i],
            from: inPlayFrom(i),
            to: ["discard-tile"],
            faces: ["face", "face"],
            lands: "discard-tile",
          }));
    case "toDeck":
      return [
        {
          kind: "flight",
          card,
          from: event.from === "hand" ? handFrom(index) : discardFrom(index),
          to: ["deck-tile"],
          faces: ["face", "back"],
          turn: EN_ROUTE,
          under: event.where === "bottom",
          delay: 0,
          lands: "deck-tile",
        },
      ];
    case "toHand":
      return event.from === "discard"
        ? [
            {
              kind: "flight",
              card,
              from: discardFrom(index),
              to: ["hand-tile"],
              faces: ["face", "face"],
              delay: 0,
              lands: "hand-tile",
            },
          ]
        : each(cards.length, flight.stagger, (i) => ({
            kind: "flight",
            card: cards[i],
            from: inPlayFrom(i),
            to: ["hand-tile"],
            faces: ["face", "face"],
            lands: "hand-tile",
          }));
    case "boost":
      return [
        {
          kind: "flight",
          card,
          from: [`hand-grid-card-${event.index}`, "hand-card", "hand-tile"],
          // the newest boost slot is the one it lands in
          to: ["boost-slot-*", "in-play-card"],
          faces: ["face", "back"],
          turn: EN_ROUTE,
          delay: 0,
        },
      ];
    case "cancelBoost":
      return each(event.count, flight.stagger, (i) => ({
        kind: "flight",
        card: cards[i],
        from: [`boost-slot-${i}`, "in-play-card"],
        to: ["hand-tile"],
        faces: ["back", "back"],
        lands: "hand-tile",
      }));
    case "mill":
      return [
        {
          kind: "flight",
          card,
          from: ["deck-tile"],
          to: ["discard-tile"],
          faces: ["back", "face"],
          turn: EN_ROUTE,
          delay: 0,
          lands: "discard-tile",
        },
      ];
    case "shuffleIn":
      return each(Math.min(event.count, flight.maxShuffleIn), flight.stagger, (i) => ({
        kind: "flight",
        card: cards[i],
        from: ["discard-tile", "discard-row-*"],
        to: ["deck-tile"],
        faces: ["back", "back"],
        lands: "deck-tile",
      }));
    case "remove":
      return [
        {
          kind: "dissolve",
          card,
          from:
            event.from === "hand"
              ? handFrom(index)
              : event.from === "play"
                ? ["in-play-card"]
                : discardFrom(index),
          to: [],
          faces: ["face", "face"],
          delay: 0,
        },
      ];
    case "shuffle":
      return [
        {
          kind: "riffle",
          cards,
          from: ["deck-tile"],
          to: [],
          faces: ["back", "back"],
          delay: 0,
        },
      ];
    default:
      return [];
  }
};

// --- landings: a tile's count waits for the card flying to it ---------------

type Landings = {
  /** a card is on its way to `anchor`; call the result once it has landed */
  hold: (anchor: string) => () => void;
  isHeld: (anchor: string) => boolean;
  subscribe: (listener: () => void) => () => void;
};

const createLandings = (): Landings => {
  const held = new Map<string, number>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    hold: (anchor) => {
      held.set(anchor, (held.get(anchor) ?? 0) + 1);
      notify();
      let landed = false;
      return () => {
        if (landed) return;
        landed = true;
        held.set(anchor, (held.get(anchor) ?? 1) - 1);
        notify();
      };
    },
    isHeld: (anchor) => (held.get(anchor) ?? 0) > 0,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const LandingsContext = createContext<Landings | undefined>(undefined);

/**
 * The count a pile tile shows: one that went UP waits while a card is still
 * flying to `anchor`, so the tick and the pulse come as it lands. A count
 * that went down (a card leaving) shows at once. Outside {@link IrlFlights},
 * or with no anchor, just `count`.
 */
export const useLandedCount = (anchor: string | undefined, count: number) => {
  const landings = useContext(LandingsContext);
  const [held, setHeld] = useState(
    () => !!anchor && !!landings?.isHeld(anchor),
  );
  useEffect(() => {
    if (!landings || !anchor) return;
    const sync = () => setHeld(landings.isHeld(anchor));
    sync();
    return landings.subscribe(sync);
  }, [landings, anchor]);
  const [shown, setShown] = useState(count);
  if (shown !== count && (!held || count < shown)) setShown(count);
  return held && count > shown ? shown : count;
};

// --- the layer ----------------------------------------------------------------

type Ghost = FlightPlan & {
  id: number;
  /** the source, read as the event fired; missing = read at take-off */
  fromRect?: AnchorRect;
  /** lets the target tile's count through */
  release?: () => void;
};

/**
 * The flight layer and the landings its tiles wait on. Mount once, around the
 * tray, inside the IrlGameProvider whose fx bus it listens to.
 */
export const IrlFlights = ({ children }: PropsWithChildren) => {
  const [landings] = useState(createLandings);
  return (
    <LandingsContext.Provider value={landings}>
      {children}
      <IrlFlightLayer />
    </LandingsContext.Provider>
  );
};

export const IrlFlightLayer = () => {
  const reduced = useIrlReducedMotion();
  const pause = useIrlFxPause();
  const landings = useContext(LandingsContext);
  const ghosts = useRef<Ghost[]>([]);
  const nextId = useRef(0);
  const [, render] = useReducer((n: number) => n + 1, 0);

  useIrlFx((event, moved) => {
    if (reduced) return;
    const added = planFlights(event, moved).map((plan) => ({
      ...plan,
      id: ++nextId.current,
      fromRect: findAnchor(plan.from)?.rect,
      release: plan.lands ? landings?.hold(plan.lands) : undefined,
    }));
    if (!added.length) return;
    // over the cap, the oldest cards give way to the newest move
    const all = [...ghosts.current, ...added];
    const over = Math.max(0, all.length - flight.maxGhosts);
    all.slice(0, over).forEach((ghost) => ghost.release?.());
    ghosts.current = all.slice(over);
    render();
  });

  const land = useCallback((id: number) => {
    const ghost = ghosts.current.find((g) => g.id === id);
    if (!ghost) return;
    ghost.release?.();
    ghosts.current = ghosts.current.filter((g) => g !== ghost);
    render();
  }, []);
  // No unmount cleanup: the holds live in IrlFlights' store and go with it —
  // and clearing here would lose the opening deal, which is announced during
  // the very mount a strict-mode remount replays.

  return (
    <div
      aria-hidden
      data-irl-flights=""
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1250,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {ghosts.current.map((ghost) => (
        <GhostCard key={ghost.id} ghost={ghost} pause={pause} onLand={land} />
      ))}
    </div>
  );
};

// --- one ghost ----------------------------------------------------------------

/** a card-shaped box, centred */
type CardBox = { cx: number; cy: number; w: number; h: number };
type Trip = { from: CardBox; to: CardBox; toRect: AnchorRect; landed: boolean };

/** the largest card that fits in `rect`, centred in it */
const cardIn = (rect: AnchorRect): CardBox => {
  const w = Math.max(1, Math.min(rect.width, rect.height / CARD_ASPECT));
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    w,
    h: w * CARD_ASPECT,
  };
};

/** the size of a card with no anchor to leave from */
const LOOSE_CARD = { width: 120, height: 120 * CARD_ASPECT };

const planTrip = (ghost: Ghost): Trip => {
  const fromRect =
    ghost.fromRect ?? findAnchor(ghost.from)?.rect ?? screenCentre(LOOSE_CARD);
  const from = cardIn(fromRect);
  if (ghost.kind !== "flight") {
    return { from, to: from, toRect: fromRect, landed: true };
  }
  const target = resolveAnchor(ghost.to, { width: from.w, height: from.h });
  return {
    from,
    to: cardIn(target.rect),
    toRect: target.rect,
    landed: target.name !== null,
  };
};

const durationOf = (kind: FlightPlan["kind"]) =>
  kind === "dissolve"
    ? IRL_MOTION.dissolve.dur
    : kind === "riffle"
      ? IRL_MOTION.riffle.dur
      : flight.dur;

const GhostCard = ({
  ghost,
  pause,
  onLand,
}: {
  ghost: Ghost;
  /** dev `?fxPause`: hold at this fraction of the trip, and stay */
  pause: number | null;
  onLand: (id: number) => void;
}) => {
  const progress = useMotionValue(0);
  const [trip, setTrip] = useState<Trip | null>(null);
  const land = useRef(() => onLand(ghost.id));
  land.current = () => onLand(ghost.id);

  // Layout effect: by now the move has rendered — the target is where it
  // will be — and the ghost is placed before the frame paints.
  useIsomorphicLayoutEffect(() => {
    const dur = durationOf(ghost.kind);
    let controls: AnimationPlaybackControls | undefined;
    const takeOff = () => {
      setTrip(planTrip(ghost));
      const to = pause ?? 1;
      controls = animate(progress, to, {
        duration: dur * to,
        ease: "linear",
        onComplete: () => {
          if (pause === null) land.current();
        },
      });
    };
    let wait: ReturnType<typeof setTimeout> | undefined;
    if (ghost.delay > 0) wait = setTimeout(takeOff, ghost.delay * 1000);
    else takeOff();
    // a flight that never reports its end (a stalled frame loop) still goes
    const safety =
      pause === null
        ? setTimeout(() => land.current(), (ghost.delay + dur) * 1000 + 1000)
        : undefined;
    return () => {
      clearTimeout(wait);
      clearTimeout(safety);
      controls?.stop();
    };
    // one trip per ghost, planned when it takes off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!trip) return null;
  if (ghost.kind === "dissolve") {
    return <Dissolve ghost={ghost} box={trip.from} progress={progress} />;
  }
  if (ghost.kind === "riffle") {
    return <Riffle ghost={ghost} box={trip.from} progress={progress} />;
  }
  return <Flight ghost={ghost} trip={trip} progress={progress} />;
};

const travel = cubicBezier(...IRL_MOTION.ease.flight);
const turnEase = cubicBezier(0.45, 0, 0.55, 1);
/** where `p` is inside `[a, b]`, 0..1 */
const within = (p: number, [a, b]: Window) =>
  Math.min(1, Math.max(0, (p - a) / (b - a)));
const bell = (p: number) => Math.sin(Math.PI * p);

/** iOS Safari ignores the unprefixed property */
const BACKFACE_HIDDEN = {
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
} as const;

const Side = ({
  face,
  card,
  width,
}: {
  face: Face;
  card?: DeckImportCardType;
  width: number;
}) =>
  face === "face" && card ? (
    <CardFace card={card} width={width} />
  ) : (
    <CardBack
      width={`${width}px`}
      height={`${width * CARD_ASPECT}px`}
      imageUrl={card?.cardBackUrl}
    />
  );

const placeAt = (box: CardBox) =>
  ({
    position: "absolute",
    left: box.cx - box.w / 2,
    top: box.cy - box.h / 2,
    width: box.w,
    height: box.h,
  }) as const;

const Flight = ({
  ghost,
  trip,
  progress,
}: {
  ghost: Ghost;
  trip: Trip;
  progress: MotionValue<number>;
}) => {
  const { from, to, toRect, landed } = trip;
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  // a slight bow and tilt, the way a card leaves a hand
  const arc = Math.min(48, Math.hypot(dx, dy) * 0.18);
  const tilt = flight.tilt * (dx < 0 ? -1 : 1);
  const grow = to.w / from.w;
  // into a pile it fades from `fadeAt`; with nowhere on screen to land, it
  // fades out early rather than pop
  const fadeFrom = ghost.fade ? flight.fadeAt : landed ? 0.86 : 0.7;
  const turns = ghost.faces[0] !== ghost.faces[1];
  const turnAt = ghost.turn ?? flight.turnLate;

  const x = useTransform(progress, (p) => dx * travel(p));
  const y = useTransform(progress, (p) => dy * travel(p) - arc * bell(travel(p)));
  const scale = useTransform(progress, (p) => 1 + (grow - 1) * travel(p));
  const rotate = useTransform(progress, (p) => tilt * bell(travel(p)));
  const opacity = useTransform(progress, (p) => 1 - within(p, [fadeFrom, 1]));
  const rotateY = useTransform(progress, (p) =>
    turns ? 180 * turnEase(within(p, turnAt)) : 0,
  );

  const card = (
    <motion.div
      data-irl-ghost={ghost.kind}
      style={{ ...placeAt(from), x, y, scale, rotate, opacity }}
    >
      {turns ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            perspective: `${Math.round(from.w * 4)}px`,
          }}
        >
          <motion.div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              transformStyle: "preserve-3d",
              rotateY,
            }}
          >
            <div style={BACKFACE_HIDDEN}>
              <Side face={ghost.faces[0]} card={ghost.card} width={from.w} />
            </div>
            <div
              style={{
                ...BACKFACE_HIDDEN,
                position: "absolute",
                top: 0,
                left: 0,
                transform: "rotateY(180deg)",
              }}
            >
              <Side face={ghost.faces[1]} card={ghost.card} width={from.w} />
            </div>
          </motion.div>
        </div>
      ) : (
        <Side face={ghost.faces[0]} card={ghost.card} width={from.w} />
      )}
    </motion.div>
  );
  if (!ghost.under || !landed) return card;

  // The bottom of the deck: the card slides UNDER the tile — the tile's box
  // is cut out of everything the ghost may paint.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { left, top, width, height } = toRect;
  const clip = `path(evenodd, "M0 0H${vw}V${vh}H0Z M${left} ${top}h${width}v${height}h${-width}Z")`;
  return (
    <div
      style={{ position: "absolute", inset: 0, clipPath: clip, WebkitClipPath: clip }}
    >
      {card}
    </div>
  );
};

/** Remove from game: grey, shrink and fade where it stands — no travel. */
const Dissolve = ({
  ghost,
  box,
  progress,
}: {
  ghost: Ghost;
  box: CardBox;
  progress: MotionValue<number>;
}) => {
  const { dissolve } = IRL_MOTION;
  const opacity = useTransform(progress, (p) => 1 - p);
  const scale = useTransform(progress, (p) => 1 - (1 - dissolve.scale) * p);
  const filter = useTransform(progress, (p) => `grayscale(${p})`);
  return (
    <motion.div
      data-irl-ghost="dissolve"
      style={{ ...placeAt(box), opacity, scale, filter }}
    >
      <Side face="face" card={ghost.card} width={box.w} />
    </motion.div>
  );
};

/** Shuffle: three backs fan out of the deck tile and collapse back in. */
const Riffle = ({
  ghost,
  box,
  progress,
}: {
  ghost: Ghost;
  box: CardBox;
  progress: MotionValue<number>;
}) => (
  <div data-irl-ghost="riffle">
    {[-1, 0, 1].map((side, i) => (
      <RiffleCard
        key={side}
        side={side}
        card={ghost.cards?.[i]}
        box={box}
        progress={progress}
      />
    ))}
  </div>
);

const RiffleCard = ({
  side,
  card,
  box,
  progress,
}: {
  side: number;
  card?: DeckImportCardType;
  box: CardBox;
  progress: MotionValue<number>;
}) => {
  const { riffle } = IRL_MOTION;
  const x = useTransform(progress, (p) => side * box.w * 0.45 * bell(p));
  const y = useTransform(
    progress,
    (p) => -riffle.lift * box.h * bell(p) * (side === 0 ? 1.25 : 1),
  );
  const rotate = useTransform(progress, (p) => side * riffle.spread * bell(p));
  const scale = useTransform(progress, (p) => 1 + 0.15 * bell(p));
  return (
    <motion.div
      style={{ ...placeAt(box), x, y, rotate, scale, transformOrigin: "50% 90%" }}
    >
      <Side face="back" card={card} width={box.w} />
    </motion.div>
  );
};
