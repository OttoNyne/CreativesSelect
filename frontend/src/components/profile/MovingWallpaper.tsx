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

/**
 * A picture wallpaper that stays still: a layer fixed behind the page with the same dark scrim. The whole picture is always shown (fitted
 * to the screen), and a blurred copy of it fills whatever the fitted picture leaves, so a wide wallpaper on a tall phone is not cut down
 * to a narrow slice. It is a layer rather than the page's background because a fixed *background* is not honoured by iPhones and iPads:
 * there the picture was stretched over the whole length of the page, so a long profile showed only a small, zoomed-in piece of it.
 */
export function StillWallpaper({ url, position, className = "fixed inset-0 -z-10" }: { url: string; position: string; className?: string }) {
  // the dark scrim is part of each picture layer (a gradient above the picture), as it was when this was the page's background
  const scrim = `linear-gradient(rgba(0,0,0,${WALLPAPER_SCRIM}), rgba(0,0,0,${WALLPAPER_SCRIM}))`;
  const picture = `url("${url}")`;
  return (
    <div aria-hidden="true" data-testid="still-wallpaper" className={`${className} overflow-hidden`}>
      <div className="absolute inset-0" style={{ backgroundImage: `${scrim}, ${picture}`, backgroundSize: "100% 100%, cover", backgroundPosition: `0 0, ${position}`, filter: "blur(28px)", transform: "scale(1.15)" }} />
      <div
        data-testid="still-wallpaper-whole"
        className="absolute inset-0"
        style={{ backgroundImage: `${scrim}, ${picture}`, backgroundSize: "100% 100%, contain", backgroundPosition: `0 0, ${position}`, backgroundRepeat: "no-repeat" }}
      />
    </div>
  );
}
