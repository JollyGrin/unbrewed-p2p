import { useEffect, useState } from "react";

export type ImageSize = { width: number; height: number };

/** A map's natural size: saved maps carry no dimensions, and the overlay ratio needs them. */
export const useImageSize = (url: string | undefined) => {
  const [size, setSize] = useState<{ url: string; size: ImageSize | null }>();
  useEffect(() => {
    if (!url) return;
    const probe = new Image();
    // Without it a host that sends no CORS headers loads here but can't be
    // fetched by table.place; failing now gives the "couldn't load" message.
    probe.crossOrigin = "anonymous";
    probe.onload = () =>
      setSize({
        url,
        size: { width: probe.naturalWidth, height: probe.naturalHeight },
      });
    probe.onerror = () => setSize({ url, size: null });
    probe.src = url;
    return () => {
      probe.onload = probe.onerror = null;
    };
  }, [url]);
  const current = size?.url === url ? size : undefined;
  return {
    size: current?.size ?? null,
    isLoading: !!url && !current,
    failed: current?.size === null,
  };
};
