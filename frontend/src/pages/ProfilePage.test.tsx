import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
vi.mock("../api/ai.api", () => ({ aiApi: { generateText: vi.fn(), generateImage: vi.fn() } }));
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
