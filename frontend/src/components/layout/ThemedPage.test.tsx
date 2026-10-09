import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ThemedPage, hasChosenBackground } from "./ThemedPage";
import type { User } from "../../types";

const base = { theme: {}, wallpaperUrl: null, wallpaperType: "image", wallpaperPosition: "50% 50%" } as Pick<User, "theme" | "wallpaperUrl" | "wallpaperType" | "wallpaperPosition" | "wallpaperMotion">;
const look = (over: Partial<typeof base> = {}) => ({ ...base, ...over });

function renderPage(over: Partial<typeof base> = {}, extra: { backgroundOnly?: boolean } = {}) {
  const { container } = render(
    <ThemedPage look={look(over)} contentClassName="column" {...extra}>
      <p>the page</p>
    </ThemedPage>
  );
  return { frame: container.firstElementChild as HTMLElement, column: screen.getByText("the page").parentElement as HTMLElement };
}

describe("hasChosenBackground", () => {
  it("is true for a colour or a wallpaper, and false for the default, or for other theme choices alone", () => {
    expect(hasChosenBackground(look({ theme: { bgColor: "#223344" } }))).toBe(true);
    expect(hasChosenBackground(look({ wallpaperUrl: "https://x/a.png" }))).toBe(true);
    expect(hasChosenBackground(look())).toBe(false);
    expect(hasChosenBackground(look({ theme: { accentColor: "#ff0000", textColor: "#ffffff" } }))).toBe(false);
    expect(hasChosenBackground(null)).toBe(false);
    expect(hasChosenBackground(undefined)).toBe(false);
  });
});

describe("ThemedPage", () => {
  it("draws the page on the chosen colour, with the content in its own column", () => {
    const { frame, column } = renderPage({ theme: { bgColor: "#102040" } });
    expect(frame).toHaveAttribute("data-scheme", "dark");
    expect(frame).not.toHaveAttribute("data-wallpaper");
    expect(frame.style.getPropertyValue("--profile-bg")).toBe("#102040");
    expect(column).toHaveClass("column");
  });

  it("flips a bright background to dark-on-light so the text stays readable", () => {
    expect(renderPage({ theme: { bgColor: "#ffffff" } }).frame).toHaveAttribute("data-scheme", "light");
  });

  it("puts a middling colour behind a panel, which a bright or dark one doesn't need", () => {
    const mid = renderPage({ theme: { bgColor: "#808080" } });
    expect(mid.column.style.background).not.toBe("");
    expect(mid.column).toHaveClass("min-h-[calc(100vh-56px)]");
  });

  it("lets the page say what the panel's classes are", () => {
    const { container } = render(
      <ThemedPage look={look({ theme: { bgColor: "#808080" } })} contentClassName="column" panelClassName="roomy">
        <p>the page</p>
      </ThemedPage>
    );
    expect(screen.getByText("the page").parentElement).toHaveClass("column", "roomy");
    expect(container.firstElementChild).toHaveAttribute("data-scheme");
  });

  it("draws a still wallpaper as a layer fixed behind the page, under a dark scrim, not as a CSS background", () => {
    const { frame } = renderPage({ wallpaperUrl: "https://cdn.example.com/w.jpg", wallpaperPosition: "20% 80%" });
    expect(frame).toHaveAttribute("data-wallpaper", "true");
    expect(frame).toHaveAttribute("data-scheme", "dark");
    const layer = screen.getByTestId("still-wallpaper");
    const backdrop = layer.firstElementChild as HTMLElement;
    expect(backdrop.style.backgroundSize).toBe("100% 100%, cover");
    expect(backdrop.style.backgroundPosition).toBe("0px 0px, 20% 80%");
    expect(backdrop.style.backgroundImage).toContain("https://cdn.example.com/w.jpg");
    expect(backdrop.style.backgroundImage).toContain("rgba(0, 0, 0, 0.55)"); // the dark scrim is part of the layer
    // the whole picture is shown, fitted to the screen, with a blurred copy filling what it leaves (so nothing is cut off)
    const whole = screen.getByTestId("still-wallpaper-whole");
    expect(whole.style.backgroundSize).toBe("100% 100%, contain");
    expect(whole.style.backgroundPosition).toBe("0px 0px, 20% 80%");
    expect(whole.style.backgroundRepeat).toBe("no-repeat");
    expect(whole.style.backgroundImage).toContain("https://cdn.example.com/w.jpg");
    expect(whole.style.backgroundImage).toContain("rgba(0, 0, 0, 0.55)");
    expect((layer.firstElementChild as HTMLElement).style.filter).toContain("blur");
    expect(layer).toHaveClass("fixed", "inset-0");
    expect(frame.style.backgroundImage).toContain("https://cdn.example.com/w.jpg"); // beneath the layer, which covers it
    expect(screen.queryByTestId("moving-wallpaper")).not.toBeInTheDocument();
  });

  it("draws a moving wallpaper as a layer of its own, and not as the background", () => {
    const { frame } = renderPage({ wallpaperUrl: "https://cdn.example.com/w.jpg", wallpaperMotion: "drift" });
    expect(screen.getByTestId("moving-wallpaper")).toHaveAttribute("data-motion", "drift");
    expect(frame.style.backgroundImage).toBe("");
  });

  it("plays a video wallpaper behind the page, silent and looping", () => {
    const { frame } = renderPage({ wallpaperUrl: "https://cdn.example.com/w.mp4", wallpaperType: "video" });
    const video = frame.querySelector("video") as HTMLVideoElement;
    expect(video).toHaveAttribute("src", "https://cdn.example.com/w.mp4");
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(frame.style.backgroundImage).toBe("");
    expect(frame).toHaveAttribute("data-wallpaper", "true");
  });

  it("takes only the background when asked, leaving the page's own text colour and font", () => {
    const withLook = { theme: { bgColor: "#102040", textColor: "#ffcc00", fontFamily: "Georgia, serif" } };
    const full = renderPage(withLook).frame;
    expect(full.style.color).not.toBe("");
    expect(full.style.fontFamily).not.toBe("");
    cleanup();
    const only = renderPage(withLook, { backgroundOnly: true }).frame;
    expect(only.style.color).toBe("");
    expect(only.style.fontFamily).toBe("");
    expect(only.style.getPropertyValue("--profile-bg")).toBe("#102040");
  });
});

describe("ThemedPage: profile styles", () => {
  it("carries the owner's choices as attributes the styles respond to, and the usual ones where nothing is chosen", () => {
    const plain = renderPage();
    expect(plain.frame).toHaveAttribute("data-card", "solid");
    expect(plain.frame).toHaveAttribute("data-corners", "rounded");
    expect(plain.frame).toHaveAttribute("data-density", "comfortable");
    expect(plain.frame).toHaveAttribute("data-headings", "caps");
    expect(plain.frame).toHaveAttribute("data-avatar", "circle");
    cleanup();
    const chosen = renderPage({ theme: { cardStyle: "glass", corners: "square", density: "roomy", headings: "serif", avatarShape: "rounded" } });
    expect(chosen.frame).toHaveAttribute("data-card", "glass");
    expect(chosen.frame).toHaveAttribute("data-corners", "square");
    expect(chosen.frame).toHaveAttribute("data-density", "roomy");
    expect(chosen.frame).toHaveAttribute("data-headings", "serif");
    expect(chosen.frame).toHaveAttribute("data-avatar", "rounded");
  });

  it("ignores a value that isn't one of the choices, rather than passing it on", () => {
    const { frame } = renderPage({ theme: { cardStyle: 'x" onload="alert(1)', corners: "huge" } });
    expect(frame).toHaveAttribute("data-card", "solid");
    expect(frame).toHaveAttribute("data-corners", "rounded");
    expect(frame.getAttribute("onload")).toBeNull();
  });

  it("leaves the feed's own look alone: the background only, with none of the profile's styles", () => {
    const { frame } = renderPage({ theme: { bgColor: "#102040", cardStyle: "glass", corners: "square" } }, { backgroundOnly: true });
    expect(frame.getAttribute("data-card")).toBeNull();
    expect(frame.getAttribute("data-corners")).toBeNull();
    expect(frame.style.getPropertyValue("--profile-bg")).toBe("#102040");
  });
});
