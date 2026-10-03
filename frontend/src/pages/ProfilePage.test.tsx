import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { ProfilePage } from "./ProfilePage";
import { profilesApi } from "../api/profiles.api";
import { friendsApi } from "../api/friends.api";
import { moderationApi } from "../api/moderation.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

vi.mock("../api/profiles.api", () => ({ profilesApi: { get: vi.fn(), updateMe: vi.fn(), deleteMe: vi.fn(), changeUsername: vi.fn() } }));
vi.mock("../api/friends.api", () => ({ friendsApi: { list: vi.fn(), request: vi.fn() } }));
vi.mock("../api/moderation.api", () => ({ moderationApi: { block: vi.fn(), report: vi.fn() } }));
vi.mock("../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../api/ai.api", () => ({ aiApi: { generateText: vi.fn(), generateImage: vi.fn(), generateWallpaper: vi.fn(), discard: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
// The profile's sections have their own data loading and are tested on their own.
vi.mock("../components/profile/TopFriendsList", () => ({ TopFriendsList: () => <div>top friends</div> }));
vi.mock("../components/profile/MusicPlayer", () => ({ MusicPlayer: () => <div>music</div> }));
vi.mock("../components/profile/PortfolioGrid", () => ({ PortfolioGrid: () => <div>portfolio</div> }));
vi.mock("../components/profile/ProfileComments", () => ({ ProfileComments: () => <div>guestbook</div> }));
vi.mock("../components/common/ImagePositioner", () => ({ ImagePositioner: () => <div>positioner</div> }));

const profiles = vi.mocked(profilesApi);
const friends = vi.mocked(friendsApi);

const zoe = { id: "u2", username: "zoe", displayName: "Zoe", bio: "Potter", isPrivate: false, theme: {}, wallpaperType: "image", wallpaperPosition: "50% 50%" } as unknown as User;
const me = { ...zoe, id: "me", username: "me", displayName: "Me", bio: "Painter" } as User;

function renderAs(viewer: User | null, username: string) {
  vi.mocked(useAuth).mockReturnValue({ user: viewer, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
  render(
    <MemoryRouter initialEntries={[`/u/${username}`]}>
      <Routes>
        <Route path="/u/:username" element={<ProfilePage />} />
        <Route path="/login" element={<div>Login screen</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  [profiles, friends, vi.mocked(moderationApi)].forEach((api) => Object.values(api).forEach((fn) => fn.mockReset()));
  friends.list.mockResolvedValue({ friends: [] });
});

describe("ProfilePage", () => {
  it("shows another creative's profile with Add Friend, Report and Block, and no editing", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    renderAs(me, "zoe");

    expect(await screen.findByRole("heading", { name: "Zoe" })).toBeInTheDocument();
    expect(screen.getByText("@zoe")).toBeInTheDocument();
    expect(screen.getByText("Potter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Friend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Block" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit profile" })).not.toBeInTheDocument();
    expect(screen.getByText("guestbook")).toBeInTheDocument();
  });

  it("sends a friend request once", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    friends.request.mockResolvedValue({ friendship: {} as never });
    renderAs(me, "zoe");

    await userEvent.click(await screen.findByRole("button", { name: "Add Friend" }));

    expect(friends.request).toHaveBeenCalledWith("zoe");
    const sent = await screen.findByRole("button", { name: "Request sent" });
    expect(sent).toBeDisabled();
  });

  it("shows 'Friends' instead of Add Friend for an existing friend", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    friends.list.mockResolvedValue({ friends: [zoe] });
    renderAs(me, "zoe");
    expect(await screen.findByText("✓ Friends")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Friend" })).not.toBeInTheDocument();
    // friends can be messaged from their profile
    expect(screen.getByRole("link", { name: "Message" })).toHaveAttribute("href", "/messages/zoe");
  });

  it("doesn't offer messaging for someone who isn't a friend", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    friends.list.mockResolvedValue({ friends: [] });
    renderAs(me, "zoe");
    expect(await screen.findByRole("button", { name: "Add Friend" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Message" })).not.toBeInTheDocument();
  });

  it("shows the unavailable message for a private or missing profile", async () => {
    profiles.get.mockRejectedValue(new ApiError(403, "This profile is private"));
    renderAs(me, "zoe");
    expect(await screen.findByText("This profile is unavailable or private.")).toBeInTheDocument();
  });

  it("lets the owner edit: bio saved through the API, and the delete-account option is offered", async () => {
    profiles.get.mockResolvedValue({ user: me });
    profiles.updateMe.mockResolvedValue({ user: { ...me, bio: "Painter and potter" } });
    renderAs(me, "me");

    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    expect(screen.getByRole("button", { name: /Delete my account/ })).toBeInTheDocument();

    const bio = screen.getByPlaceholderText(/Tell people what you make/);
    await userEvent.clear(bio);
    await userEvent.type(bio, "Painter and potter");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(profiles.updateMe).toHaveBeenCalled());
    expect(profiles.updateMe.mock.calls[0][0]).toMatchObject({ bio: "Painter and potter" });
  });

  it("auto-saves the private-profile toggle", async () => {
    profiles.get.mockResolvedValue({ user: me });
    profiles.updateMe.mockResolvedValue({ user: { ...me, isPrivate: true } });
    renderAs(me, "me");

    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    await userEvent.click(screen.getByLabelText("Private profile"));

    expect(profiles.updateMe).toHaveBeenCalledWith({ isPrivate: true });
  });

  it("ignores a late failure from a profile it already navigated away from (rename race)", async () => {
    let rejectOld!: (e: unknown) => void;
    profiles.get.mockImplementation((name: string) =>
      name === "old"
        ? new Promise((_resolve, reject) => {
            rejectOld = reject;
          })
        : Promise.resolve({ user: { ...zoe, username: name } })
    );
    vi.mocked(useAuth).mockReturnValue({ user: me, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
    render(
      <MemoryRouter initialEntries={["/u/old"]}>
        <Link to="/u/zoe">go</Link>
        <Routes>
          <Route path="/u/:username" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("link", { name: "go" }));
    expect(await screen.findByRole("heading", { name: "Zoe" })).toBeInTheDocument();

    rejectOld(new ApiError(404, "User not found")); // the old address answers, late
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByRole("heading", { name: "Zoe" })).toBeInTheDocument();
    expect(screen.queryByText(/unavailable or private/)).not.toBeInTheDocument();
  });

  it("changing the username moves the page to the new address and shows the new name", async () => {
    profiles.get.mockImplementation(async (name: string) => ({ user: name === "me2" ? { ...me, username: "me2" } : me }));
    profiles.changeUsername.mockResolvedValue({ user: { ...me, username: "me2" } });
    renderAs(me, "me");

    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    const input = screen.getByLabelText(/^Username/);
    await userEvent.clear(input);
    await userEvent.type(input, "me2");
    await userEvent.click(screen.getByRole("button", { name: "Change username" }));

    expect(profiles.changeUsername).toHaveBeenCalledWith("me2");
    await waitFor(() => expect(profiles.get).toHaveBeenCalledWith("me2"));
    expect(await screen.findByText("@me2")).toBeInTheDocument();
  });

  it("lets the owner change their display name from the edit panel", async () => {
    profiles.get.mockResolvedValue({ user: me });
    profiles.updateMe.mockResolvedValue({ user: { ...me, displayName: "Painter Me" } });
    renderAs(me, "me");

    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    const input = screen.getByLabelText("Display name");
    await userEvent.clear(input);
    await userEvent.type(input, "Painter Me");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(profiles.updateMe).toHaveBeenCalledWith({ displayName: "Painter Me" });
    expect(await screen.findByRole("heading", { name: "Painter Me" })).toBeInTheDocument();
  });

  it("alerts with the server's message if saving fails", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    profiles.get.mockResolvedValue({ user: me });
    profiles.updateMe.mockRejectedValue(new ApiError(400, "Invalid input"));
    renderAs(me, "me");

    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Invalid input"));
    alertSpy.mockRestore();
  });
});

describe("ProfilePage on different backgrounds", () => {
  const withTheme = (theme: User["theme"], extra: Partial<User> = {}) => ({ ...zoe, theme, ...extra }) as User;
  const pageOf = async () => (await screen.findByRole("heading", { name: "Zoe" })).closest("[data-scheme]") as HTMLElement;

  it("uses the dark styling and no panel on the default theme", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    renderAs(me, "zoe");
    const page = await pageOf();
    expect(page).toHaveAttribute("data-scheme", "dark");
    expect(page.style.getPropertyValue("--profile-text")).toBe("#f5f5f7");
    expect(page.querySelector("[style*='rgba(12,12,18']")).toBeNull();
  });

  it("switches to the light styling on a light background", async () => {
    profiles.get.mockResolvedValue({ user: withTheme({ bgColor: "#ffffff", textColor: "#111111" }) });
    renderAs(me, "zoe");
    expect(await pageOf()).toHaveAttribute("data-scheme", "light");
  });

  it("corrects a text colour that can't be read against the background", async () => {
    profiles.get.mockResolvedValue({ user: withTheme({ bgColor: "#ffffff", textColor: "#fafafa" }) });
    renderAs(me, "zoe");
    const page = await pageOf();
    expect(page.style.getPropertyValue("--profile-text")).not.toBe("#fafafa");
  });

  it("puts the content on a panel when the background is a mid-tone", async () => {
    profiles.get.mockResolvedValue({ user: withTheme({ bgColor: "#808080", textColor: "#808080" }) });
    renderAs(me, "zoe");
    const page = await pageOf();
    expect(page).toHaveAttribute("data-scheme", "dark");
    expect(page.querySelector("[style*='rgba(12, 12, 18']")).not.toBeNull();
  });

  it("uses a light panel on a bright mid-tone such as yellow", async () => {
    profiles.get.mockResolvedValue({ user: withTheme({ bgColor: "#ffd60a" }) });
    renderAs(me, "zoe");
    const page = await pageOf();
    expect(page).toHaveAttribute("data-scheme", "light");
    expect(page.querySelector("[style*='rgba(255, 255, 255']")).not.toBeNull();
  });

  it("stays dark, flagged as a wallpaper page, when there is a wallpaper, whatever the background colour", async () => {
    profiles.get.mockResolvedValue({ user: withTheme({ bgColor: "#ffffff" }, { wallpaperUrl: "https://x/w.jpg" }) });
    renderAs(me, "zoe");
    const page = await pageOf();
    expect(page).toHaveAttribute("data-scheme", "dark");
    expect(page).toHaveAttribute("data-wallpaper", "true");
  });
});

describe("ProfilePage: moving wallpapers", () => {
  const withWallpaper = (extra: Partial<User>) => ({ ...zoe, wallpaperUrl: "https://x/w.jpg", ...extra }) as User;
  const rootOf = async () => (await screen.findByRole("heading", { name: "Zoe" })).closest("[data-scheme]") as HTMLElement;

  it("draws a picture wallpaper that has a motion as a moving layer behind the page, not as the page's background", async () => {
    profiles.get.mockResolvedValue({ user: withWallpaper({ wallpaperMotion: "drift", wallpaperPosition: "20% 80%" }) });
    renderAs(me, "zoe");
    const root = await rootOf();
    const layer = screen.getByTestId("moving-wallpaper");
    expect(layer).toHaveAttribute("data-motion", "drift");
    expect(layer.querySelector<HTMLElement>(".wallpaper-motion")!.style.backgroundPosition).toBe("20% 80%");
    expect(root.style.backgroundImage).toBe("");
    // the layer sits above the page's own colour but below its content
    expect(root).toHaveClass("isolate");
    expect(root).toHaveAttribute("data-wallpaper", "true");
    expect(root).toHaveAttribute("data-scheme", "dark");
  });

  it("keeps a still picture wallpaper as the page's background", async () => {
    profiles.get.mockResolvedValue({ user: withWallpaper({ wallpaperMotion: "none" }) });
    renderAs(me, "zoe");
    const root = await rootOf();
    expect(screen.queryByTestId("moving-wallpaper")).not.toBeInTheDocument();
    expect(root.style.backgroundImage).toContain("https://x/w.jpg");
  });

  it("treats a profile saved before wallpapers could move as still", async () => {
    profiles.get.mockResolvedValue({ user: withWallpaper({}) });
    renderAs(me, "zoe");
    await rootOf();
    expect(screen.queryByTestId("moving-wallpaper")).not.toBeInTheDocument();
  });

  it("doesn't try to move a video wallpaper, which plays by itself", async () => {
    profiles.get.mockResolvedValue({ user: withWallpaper({ wallpaperType: "video", wallpaperUrl: "https://x/w.mp4", wallpaperMotion: "zoom" }) });
    renderAs(me, "zoe");
    await rootOf();
    expect(screen.queryByTestId("moving-wallpaper")).not.toBeInTheDocument();
    expect(document.querySelector("video")).not.toBeNull();
  });

  it("has nothing to move without a wallpaper", async () => {
    profiles.get.mockResolvedValue({ user: { ...zoe, wallpaperMotion: "zoom" } as User });
    renderAs(me, "zoe");
    await rootOf();
    expect(screen.queryByTestId("moving-wallpaper")).not.toBeInTheDocument();
  });

  it("offers the AI wallpaper studio only to the owner, while editing", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    renderAs(me, "zoe");
    await rootOf();
    expect(screen.queryByRole("region", { name: "AI wallpaper" })).not.toBeInTheDocument();

    profiles.get.mockResolvedValue({ user: me });
    cleanup();
    renderAs(me, "me");
    expect(screen.queryByRole("region", { name: "AI wallpaper" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    expect(screen.getByRole("region", { name: "AI wallpaper" })).toBeInTheDocument();
  });

  it("changes how the current wallpaper moves as soon as a motion is picked", async () => {
    profiles.get.mockResolvedValue({ user: { ...me, wallpaperUrl: "https://x/w.jpg", wallpaperMotion: "none" } as User });
    profiles.updateMe.mockResolvedValue({ user: { ...me, wallpaperUrl: "https://x/w.jpg", wallpaperMotion: "pan" } as User });
    renderAs(me, "me");
    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    await userEvent.click(screen.getByRole("radio", { name: "Pan" }));
    expect(profiles.updateMe).toHaveBeenCalledWith({ wallpaperMotion: "pan" });
    expect(await screen.findByTestId("moving-wallpaper")).toHaveAttribute("data-motion", "pan");
  });

  it("makes a wallpaper from a description and saves it, with its motion, only when the owner chooses to use it", async () => {
    profiles.get.mockResolvedValue({ user: me });
    const api = vi.mocked((await import("../api/ai.api")).aiApi);
    api.generateWallpaper.mockResolvedValue({ url: "https://cdn/generated.jpg", usedReference: false });
    profiles.updateMe.mockResolvedValue({ user: { ...me, wallpaperUrl: "https://cdn/generated.jpg", wallpaperMotion: "zoom" } as User });
    renderAs(me, "me");
    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));

    await userEvent.type(screen.getByLabelText(/What should it look like/), "a harbor at dusk");
    await userEvent.click(screen.getByRole("button", { name: /Generate live wallpaper/ }));
    await screen.findByRole("img", { name: "Your new wallpaper" });
    expect(profiles.updateMe).not.toHaveBeenCalled(); // a preview changes nothing

    await userEvent.click(screen.getByRole("button", { name: "Use this wallpaper" }));
    await waitFor(() =>
      expect(profiles.updateMe).toHaveBeenCalledWith({ wallpaperUrl: "https://cdn/generated.jpg", wallpaperType: "image", wallpaperPosition: "50% 50%", wallpaperMotion: "zoom" })
    );
    expect(await screen.findByTestId("moving-wallpaper")).toHaveAttribute("data-motion", "zoom");
  });
});
