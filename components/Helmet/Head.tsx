import Head from "next/head";
import Script from "next/script";

export const SITE_URL = "https://unbrewed.xyz";

export const DEFAULT_TITLE =
  "Unbrewed — Play Unmatched Fan Decks Online in Your Browser";
export const DEFAULT_DESCRIPTION =
  "Free browser simulator for the Unmatched board game. Play homebrew fan decks head-to-head — no account, no install. Imports from unmatched.cards, the-unmatched.club, and Tabletop Simulator.";
export const DEFAULT_IMAGE = "/og.png";
const THEME_COLOR = "#48284f";

export type SeoProps = {
  title?: string;
  description?: string;
  /** Path portion of the canonical URL, starting with "/" (e.g. "/bag"). */
  path?: string;
  /** Absolute URL or site-relative path to the social share image. */
  image?: string;
  noindex?: boolean;
};

/**
 * Per-page SEO tags. Render this in any page to override the site defaults —
 * Next dedupes each tag by its `key`, so a page-level value replaces the
 * default set in `_app` via {@link DocumentHeader}.
 */
export const PageSeo = ({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  image = DEFAULT_IMAGE,
  noindex = false,
}: SeoProps) => {
  const canonical = `${SITE_URL}${path}`;
  const absoluteImage = image.startsWith("http")
    ? image
    : `${SITE_URL}${image}`;

  return (
    <Head>
      <title key="title">{title}</title>
      <meta key="description" name="description" content={description} />
      <meta
        key="viewport"
        name="viewport"
        content="width=device-width, initial-scale=1"
      />
      {noindex && (
        <meta key="robots" name="robots" content="noindex, nofollow" />
      )}
      <link key="canonical" rel="canonical" href={canonical} />
      <meta key="theme-color" name="theme-color" content={THEME_COLOR} />

      {/* Open Graph */}
      <meta key="og:type" property="og:type" content="website" />
      <meta key="og:site_name" property="og:site_name" content="Unbrewed" />
      <meta key="og:title" property="og:title" content={title} />
      <meta
        key="og:description"
        property="og:description"
        content={description}
      />
      <meta key="og:url" property="og:url" content={canonical} />
      <meta key="og:image" property="og:image" content={absoluteImage} />
      <meta key="og:image:width" property="og:image:width" content="1200" />
      <meta key="og:image:height" property="og:image:height" content="630" />

      {/* Twitter */}
      <meta
        key="twitter:card"
        name="twitter:card"
        content="summary_large_image"
      />
      <meta key="twitter:title" name="twitter:title" content={title} />
      <meta
        key="twitter:description"
        name="twitter:description"
        content={description}
      />
      <meta key="twitter:image" name="twitter:image" content={absoluteImage} />

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;700&display=swap"
        rel="stylesheet"
      />
      <link rel="icon" href="/favicon.ico" />
    </Head>
  );
};

/**
 * Site-wide default head + analytics. Rendered once in `_app`. Individual
 * pages layer {@link PageSeo} on top to override title/description/canonical.
 */
export const DocumentHeader = () => {
  return (
    <>
      <PageSeo />
      <Script
        src="https://cdn.counter.dev/script.js"
        data-id="74aa2526-c0ed-4d9b-8547-a5cfedcb301a"
        data-utcoffset="1"
      />
    </>
  );
};
