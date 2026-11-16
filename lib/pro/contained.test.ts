import { containedBreakpoints, containedLayoutMode, containedOrigin, containedOwnsKeys, proVh, proVw } from "./contained";
import { createMemoryRoomStore } from "./roomStore";

describe("containedLayoutMode — the arrangement follows the box (#1678)", () => {
  it.each([
    [360, 640, "portrait"],
    [600, 600, "portrait"],
    [720, 520, "rail"],
    [960, 600, "rail"], // wide enough for the desktop overlays, not tall enough
    [899, 900, "portrait"],
    [900, 680, "desktop"],
    [1120, 680, "desktop"],
    [1440, 900, "desktop"],
  ])("%d × %d → %s", (width, height, mode) => {
    expect(containedLayoutMode(width, height)).toBe(mode);
  });
});

describe("containedBreakpoints — responsive props answer to the frame", () => {
  const theme = { base: "0em", sm: "30em", md: "48em", lg: "62em", xl: "80em", "2xl": "96em" };
  it("turns reached breakpoints on and the rest off", () => {
    expect(containedBreakpoints(theme, 720)).toEqual({ base: "0em", sm: "0em", md: "99999em", lg: "99999em", xl: "99999em", "2xl": "99999em" });
    expect(containedBreakpoints(theme, 992).lg).toBe("0em");
    expect(containedBreakpoints(theme, 360).sm).toBe("99999em");
  });
});

describe("viewport-unit helpers", () => {
  it("fall back to the unit the call site always used when no frame sets the variable", () => {
    expect(proVh(62)).toBe("calc(var(--pro-vh, 1svh) * 62)");
    expect(proVh(100, "dvh")).toBe("calc(var(--pro-vh, 1dvh) * 100)");
    expect(proVw(90, "svw")).toBe("calc(var(--pro-vw, 1svw) * 90)");
  });
});

describe("frame helpers on a full page (no frame)", () => {
  it("own every key and sit at the viewport's origin", () => {
    expect(containedOwnsKeys(null)).toBe(true);
    expect(containedOrigin(null)).toEqual({ left: 0, top: 0 });
  });
  it("own keys only while focus is inside the frame", () => {
    const frame = document.createElement("div");
    const inside = document.createElement("button");
    const outside = document.createElement("button");
    frame.appendChild(inside);
    document.body.append(frame, outside);
    outside.focus();
    expect(containedOwnsKeys(frame)).toBe(false);
    inside.focus();
    expect(containedOwnsKeys(frame)).toBe(true);
    frame.remove();
    outside.remove();
  });
});

describe("createMemoryRoomStore — an ephemeral socket's private store", () => {
  it("keeps a seat for its own lifetime and writes nothing to the browser", () => {
    const store = createMemoryRoomStore();
    store.setToken("R1", "tok");
    store.setResumeToken("R1", "blob");
    store.setRoomBots("R1", { p2: "easy" });
    store.rememberRoom("R1");
    expect(store.getToken("R1")).toBe("tok");
    expect(store.getTabToken("R1")).toBe("tok");
    expect(store.getRoomBots("R1")).toEqual({ p2: "easy" });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    store.retireFinishedRoom("R1");
    expect(store.getResumeToken("R1")).toBeNull();
    expect(store.getToken("R1")).toBe("tok"); // the decided game's seat still holds
    store.forgetRoom("R1");
    expect(store.getToken("R1")).toBeNull();
    expect(createMemoryRoomStore().getToken("R1")).toBeNull(); // not shared between sockets
  });
});
