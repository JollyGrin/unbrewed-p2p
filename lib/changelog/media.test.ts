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
  it("default to the CDN when the media var is unset", () => {
    delete process.env.NEXT_PUBLIC_CHANGELOG_MEDIA_URL;
    jest.isolateModules(() => {
      const { videoUrl, posterUrl } = require("./media");
      expect(videoUrl("tabletop")).toBe("https://cdn.unbrewed.xyz/changelog/tabletop.mp4");
      expect(posterUrl("tabletop")).toBe(
        "https://cdn.unbrewed.xyz/changelog/tabletop-poster.webp",
      );
    });
  });

  it("default to the CDN when the media var is empty", () => {
    process.env.NEXT_PUBLIC_CHANGELOG_MEDIA_URL = "";
    jest.isolateModules(() => {
      const { posterUrl } = require("./media");
      expect(posterUrl("tabletop")).toBe(
        "https://cdn.unbrewed.xyz/changelog/tabletop-poster.webp",
      );
    });
  });

  it("return null for an empty slug", () => {
    delete process.env.NEXT_PUBLIC_CHANGELOG_MEDIA_URL;
    jest.isolateModules(() => {
      const { videoUrl, posterUrl } = require("./media");
      expect(videoUrl("")).toBeNull();
      expect(posterUrl("")).toBeNull();
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
