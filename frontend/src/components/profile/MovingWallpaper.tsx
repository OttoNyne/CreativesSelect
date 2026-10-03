import type { WallpaperMotion } from "../../types";
import { WALLPAPER_SCRIM } from "../../theme/contrast";

/**
 * A picture wallpaper that moves. It is a layer fixed behind the page: the picture is drawn a little larger than the screen
 * and slowly shifted, zoomed or brightened by the browser (see index.css), with the same dark scrim as a still wallpaper so
 * text stays readable. People who have asked their device for less motion get the still picture.
 */
export function MovingWallpaper({
  url,
  position,
  motion,
  className = "fixed inset-0 -z-10",
}: {
  url: string;
  position: string;
  motion: Exclude<WallpaperMotion, "none">;
  /** Where the layer sits: the whole screen behind a profile, or (in a preview) a box. */
  className?: string;
}) {
  return (
    <div aria-hidden="true" data-testid="moving-wallpaper" data-motion={motion} className={`${className} overflow-hidden`}>
      <div
        className={`wallpaper-motion wallpaper-motion-${motion}`}
        style={{ backgroundImage: `url("${url}")`, backgroundSize: "cover", backgroundPosition: position }}
      />
      <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${WALLPAPER_SCRIM})` }} />
    </div>
  );
}
