import type { CSSProperties, ReactNode } from "react";
import { assetUrl } from "../../api/client";
import type { User } from "../../types";
import { PANEL_STYLE, WALLPAPER_SCRIM } from "../../theme/contrast";
import { profileThemeStyle, readableTheme } from "../../theme/applyProfileTheme";
import { motionOf } from "../../lib/wallpaperMotion";
import { MovingWallpaper } from "../profile/MovingWallpaper";

type Look = Pick<User, "theme" | "wallpaperUrl" | "wallpaperType" | "wallpaperPosition" | "wallpaperMotion">;

/** Whether a person has chosen a background for their profile (a colour or a wallpaper), as opposed to leaving the default. */
export const hasChosenBackground = (look: Partial<Look> | null | undefined): boolean => Boolean(look && (look.theme?.bgColor || look.wallpaperUrl));

/**
 * A page drawn on a person's own background: the colour or wallpaper (a picture, a moving picture or a video) they picked for their
 * profile, with the text kept readable on it (a dark scrim over a wallpaper, a light or dark panel for a middling colour, and the
 * page's white-on-dark styling flipped for a bright one; see index.css). The profile uses it with their fonts and colours too;
 * `backgroundOnly` (the feed) takes just the background and leaves the page's own text and font alone.
 */
export function ThemedPage({
  look,
  contentClassName,
  panelClassName = "min-h-[calc(100vh-56px)] sm:rounded-b-2xl",
  backgroundOnly = false,
  children,
}: {
  look: Look;
  /** The column the page's content sits in. */
  contentClassName: string;
  /** Added to the column when the background is one that needs a panel behind the content. */
  panelClassName?: string;
  backgroundOnly?: boolean;
  children: ReactNode;
}) {
  const wallpaperUrl = assetUrl(look.wallpaperUrl);
  const isVideoWallpaper = look.wallpaperType === "video" && Boolean(wallpaperUrl);
  // A picture that moves is drawn as its own layer behind the page; a still one is the page's background.
  const motion = motionOf(look.wallpaperMotion);
  const isMovingWallpaper = Boolean(wallpaperUrl) && !isVideoWallpaper && motion !== "none";

  // data-scheme="light" flips the page's white-on-dark styling for a bright background (see index.css), so text stays readable.
  const { scheme, panel } = readableTheme(look.theme, Boolean(wallpaperUrl));
  const style: CSSProperties = profileThemeStyle(look.theme, isVideoWallpaper || isMovingWallpaper ? undefined : wallpaperUrl, look.wallpaperPosition, Boolean(wallpaperUrl));
  if (backgroundOnly) {
    delete style.color;
    delete style.fontFamily;
  }

  return (
    <div data-scheme={scheme} data-wallpaper={wallpaperUrl ? "true" : undefined} style={style} className="isolate min-h-[calc(100vh-56px)]">
      {isMovingWallpaper && <MovingWallpaper url={wallpaperUrl!} position={look.wallpaperPosition} motion={motion} />}
      {isVideoWallpaper && (
        <>
          <video src={wallpaperUrl} style={{ objectPosition: look.wallpaperPosition }} className="fixed inset-0 -z-10 h-full w-full object-cover" autoPlay loop muted playsInline />
          <div className="fixed inset-0 -z-10" style={{ background: `rgba(0,0,0,${WALLPAPER_SCRIM})` }} />
        </>
      )}
      <div className={`${contentClassName} ${panel ? panelClassName : ""}`} style={panel ? { background: PANEL_STYLE[panel] } : undefined}>
        {children}
      </div>
    </div>
  );
}
