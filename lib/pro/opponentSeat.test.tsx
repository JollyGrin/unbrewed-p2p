import { act, renderHook } from "@testing-library/react";
import { coerceBotTier } from "./botTiers";
import { useOpponentSeat } from "./opponentSeat";

/**
 * The race this hook exists for (#593): on the static export `router.query` is
 * empty for the first render, so `?vs=` resolves to a real value one render
 * LATER — modelled here by rerendering with a `vsBot` that starts null.
 */
describe("useOpponentSeat", () => {
  it("starts on a human seat", () => {
    const { result } = renderHook(() => useOpponentSeat(null));
    expect(result.current.opponent).toBe("human");
  });

  it("applies the ?vs= preset once the param resolves", () => {
    const { result, rerender } = renderHook(({ vs }) => useOpponentSeat(vs), {
      initialProps: { vs: null as "medium" | null },
    });
    expect(result.current.opponent).toBe("human");
    rerender({ vs: "medium" });
    expect(result.current.opponent).toBe("medium");
  });

  it("keeps a manual Expert pick when the preset resolves afterwards", () => {
    // The reported bug: land from a `?vs=ai` CTA (= medium), click Expert before
    // hydration lands, and the preset used to silently stomp it back to medium.
    const { result, rerender } = renderHook(({ vs }) => useOpponentSeat(vs), {
      initialProps: { vs: null as "medium" | null },
    });
    act(() => result.current.chooseOpponent("expert"));
    expect(result.current.opponent).toBe("expert");
    rerender({ vs: "medium" });
    expect(result.current.opponent).toBe("expert");
  });

  it("does not re-stomp a manual pick made after the preset applied", () => {
    const { result, rerender } = renderHook(({ vs }) => useOpponentSeat(vs), {
      initialProps: { vs: null as "medium" | null },
    });
    rerender({ vs: "medium" });
    expect(result.current.opponent).toBe("medium");
    act(() => result.current.chooseOpponent("expert"));
    rerender({ vs: "medium" });
    expect(result.current.opponent).toBe("expert");
  });

  it("ignores a ?vs= value that changes after the preset already applied", () => {
    // One-shot by design — the param is still in the URL on every later render.
    const { result, rerender } = renderHook(({ vs }) => useOpponentSeat(vs), {
      initialProps: { vs: null as "medium" | "hard" | null },
    });
    rerender({ vs: "medium" });
    rerender({ vs: "hard" });
    expect(result.current.opponent).toBe("medium");
  });

  it("lets a machine revision narrow the seat without locking it", () => {
    // Tier pruning (an armed tier the server stops offering) is not a choice, so
    // it must not disable the preset for a player who never touched the strip.
    const { result, rerender } = renderHook(({ vs }) => useOpponentSeat(vs), {
      initialProps: { vs: null as "medium" | null },
    });
    act(() => result.current.reviseOpponent("human"));
    rerender({ vs: "medium" });
    expect(result.current.opponent).toBe("medium");
  });

  it("prunes a manually chosen Expert seat one rung down, never to medium", () => {
    // The seat lock is against hydration only: `coerceBotTier` still applies, and
    // an unserveable expert lands on hard (never silently on medium).
    const { result } = renderHook(() => useOpponentSeat(null));
    act(() => result.current.chooseOpponent("expert"));
    act(() =>
      result.current.reviseOpponent((prev) =>
        prev === "human" ? prev : coerceBotTier(prev, ["easy", "medium", "hard"]),
      ),
    );
    expect(result.current.opponent).toBe("hard");
  });
});
