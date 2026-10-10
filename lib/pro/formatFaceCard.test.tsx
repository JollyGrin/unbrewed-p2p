import { renderHook } from "@testing-library/react";
import { useProCardArt } from "./useProCardArt";
import { formatCardFace } from "@/components/Pro/FormatOverlay";
import { ADVENTURE_CARD_CDN_BASE } from "./adventureCardArt";

jest.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined, isLoading: false }) }));

describe("format card faces", () => {
  const face = formatCardFace("adventure");
  const run = () => renderHook(() => useProCardArt([], {}, null, face)).result.current.resolveCard;
  it("resolves a mapped enemy instance to its CDN face", () => {
    const c = run()("indominus-rex/bigger-louder-more-teeth#2");
    expect(c?.cardImage?.url).toBe(`${ADVENTURE_CARD_CDN_BASE}/irex/irex-bigger.webp`);
  });
  it("keeps the text fallback for unmapped ids and non-adventure formats", () => {
    expect(run()("indominus-rex/unknown#1")).toBeNull();
    expect(formatCardFace("duel")).toBeUndefined();
  });
});
