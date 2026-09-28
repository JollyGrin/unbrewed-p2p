/**
 * `NEXT_PUBLIC_CHANGELOG_MEDIA_URL` is read once at module load (Next inlines
 * `NEXT_PUBLIC_*` vars at build time the same way), so each case needs its
 * own fresh module instance via `jest.isolateModules`.
 */
const ORIGINAL_ENV = process.env.NEXT_PUBLIC_CHANGELOG_MEDIA_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_CHANGELOG_MEDIA_URL = ORIGINAL_ENV;
});

describe("changelog media helpers", () => {
  it("return null for both helpers when the media var is unset", () => {
    delete process.env.NEXT_PUBLIC_CHANGELOG_MEDIA_URL;
    jest.isolateModules(() => {
      const { videoUrl, posterUrl } = require("./media");
      expect(videoUrl("tabletop")).toBeNull();
      expect(posterUrl("tabletop")).toBeNull();
    });
  });

  it("build the video and poster URLs from the base when set", () => {
    process.env.NEXT_PUBLIC_CHANGELOG_MEDIA_URL = "https://example.invalid";
    jest.isolateModules(() => {
      const { videoUrl, posterUrl } = require("./media");
      expect(videoUrl("tabletop")).toBe("https://example.invalid/changelog/tabletop.mp4");
      expect(posterUrl("tabletop")).toBe(
        "https://example.invalid/changelog/tabletop-poster.webp",
      );
    });
  });

  it("strips a trailing slash from the base", () => {
    process.env.NEXT_PUBLIC_CHANGELOG_MEDIA_URL = "https://example.invalid/";
    jest.isolateModules(() => {
      const { videoUrl } = require("./media");
      expect(videoUrl("tabletop")).toBe("https://example.invalid/changelog/tabletop.mp4");
    });
  });
});
