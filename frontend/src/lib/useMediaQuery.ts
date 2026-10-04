import { useEffect, useState } from "react";

const supported = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

/** Whether a CSS media query currently matches, kept up to date (false where the browser can't say). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (supported() ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (!supported()) return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/** Wide enough for the side-by-side layout (tablet and desktop); phones get the tabbed one. */
export const useIsWideScreen = () => useMediaQuery("(min-width: 768px)");
