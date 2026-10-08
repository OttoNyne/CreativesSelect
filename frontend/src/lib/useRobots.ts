import { useEffect } from "react";

/**
 * Tells search engines that run the page whether it may be listed. A profile is kept out unless its owner switched
 * listing on; the tag is taken away again when the page is left, so no other page inherits it.
 */
export function useRobots(index: boolean | null) {
  useEffect(() => {
    if (index === null) return;
    const tag = document.createElement("meta");
    tag.name = "robots";
    tag.content = index ? "index,follow" : "noindex,nofollow";
    document.head.appendChild(tag);
    return () => tag.remove();
  }, [index]);
}
