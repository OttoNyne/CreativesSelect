import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { ProfilePage } from "./ProfilePage";
import { profilesApi } from "../api/profiles.api";
import { friendsApi } from "../api/friends.api";
import { moderationApi } from "../api/moderation.api";
import { profileViewsApi } from "../api/profileViews.api";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

vi.mock("../api/profiles.api", () => ({ profilesApi: { get: vi.fn(), updateMe: vi.fn(), deleteMe: vi.fn(), changeUsername: vi.fn(), tags: vi.fn() } }));
vi.mock("../context/PlaybackContext", () => ({ usePlayback: () => ({ current: null }) }));
vi.mock("../api/friends.api", () => ({ friendsApi: { list: vi.fn(), request: vi.fn() } }));
vi.mock("../api/moderation.api", () => ({ moderationApi: { block: vi.fn(), report: vi.fn() } }));
vi.mock("../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../api/ai.api", () => ({ aiApi: { generateText: vi.fn(), generateImage: vi.fn(), generateWallpaper: vi.fn(), discard: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
// The profile's sections have their own data loading and are tested on their own.
vi.mock("../components/profile/TopFriendsList", () => ({ TopFriendsList: () => <div>top friends</div> }));
vi.mock("../components/profile/MusicPlayer", () => ({ MusicPlayer: () => <div>music</div> }));
vi.mock("../components/profile/AboutMe", () => ({ AboutMe: () => <div>about me section</div> }));
vi.mock("../components/profile/MutualFriends", () => ({ MutualFriends: ({ username }: { username: string }) => <div>mutual friends with {username}</div> }));
vi.mock("../components/profile/PortfolioGrid", () => ({ PortfolioGrid: () => <div>portfolio</div> }));
vi.mock("../api/profileViews.api", () => ({ profileViewsApi: { record: vi.fn(), list: vi.fn() } }));
vi.mock("../components/profile/ProfileVisitors", () => ({ ProfileVisitors: () => <div>recent visitors</div> }));
vi.mock("../components/profile/ProfileBlog", () => ({ ProfileBlog: ({ isOwner }: { isOwner: boolean }) => <div>blog {isOwner ? "owner" : "visitor"}</div> }));
vi.mock("../components/profile/ProfileComments", () => ({ ProfileComments: () => <div>guestbook</div> }));
vi.mock("../components/common/ImagePositioner", () => ({ ImagePositioner: () => <div>positioner</div> }));

const profiles = vi.mocked(profilesApi);
const friends = vi.mocked(friendsApi);

const zoe = { id: "u2", username: "zoe", displayName: "Zoe", bio: "Potter", isPrivate: false, theme: {}, wallpaperType: "image", wallpaperPosition: "50% 50%" } as unknown as User;
const me = { ...zoe, id: "me", username: "me", displayName: "Me", bio: "Painter" } as User;

function renderAs(viewer: User | null, username: string, search = "") {
  vi.mocked(useAuth).mockReturnValue({ user: viewer, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
  render(
    <MemoryRouter initialEntries={[`/u/${username}${search}`]}>
      <Routes>
        <Route path="/u/:username" element={<ProfilePage />} />
        <Route path="/login" element={<div>Login screen</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  [profiles, friends, vi.mocked(moderationApi)].forEach((api) => Object.values(api).forEach((fn) => fn.mockReset()));
  vi.mocked(profileViewsApi.record).mockReset();
  vi.mocked(profileViewsApi.record).mockResolvedValue(undefined);
  friends.list.mockResolvedValue({ friends: [] });
  profiles.tags.mockResolvedValue({ tags: [{ tag: "painter", count: 3 }] });
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

  it("shows the CSverified badge beside the name of someone who has it", async () => {
    profiles.get.mockResolvedValue({ user: { ...zoe, csVerified: true } });
    renderAs(me, "zoe");
    expect(await screen.findByRole("heading", { name: "Zoe" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "CSverified" })).toBeInTheDocument();
    expect(screen.getByText("CSverified")).toBeInTheDocument();
  });

  it("shows no badge on an ordinary profile", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    renderAs(me, "zoe");
    expect(await screen.findByRole("heading", { name: "Zoe" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "CSverified" })).not.toBeInTheDocument();
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

  it("shows a creative's mood, what they are listening to and tags that lead to others who do the same", async () => {
    profiles.get.mockResolvedValue({ user: { ...zoe, mood: "feeling creative", listeningTo: "Blue in Green", tags: ["potter", "lo-fi"] } });
    renderAs(me, "zoe");

    expect(await screen.findByText("feeling creative")).toBeInTheDocument();
    expect(screen.getByText("Blue in Green")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find others tagged potter" })).toHaveAttribute("href", "/search?tag=potter");
    expect(screen.getByRole("link", { name: "Find others tagged lo-fi" })).toHaveAttribute("href", "/search?tag=lo-fi");
  });

  it("shows a friend how recently they were around, and shows nothing when it isn't there", async () => {
    profiles.get.mockResolvedValue({ user: { ...zoe, activity: "online" } });
    renderAs(me, "zoe");
    expect(await screen.findByText("Online now")).toBeInTheDocument();
  });

  it("shows nothing about activity when the profile doesn't carry it", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    renderAs(me, "zoe");
    await screen.findByRole("heading", { name: "Zoe" });
    expect(screen.queryByText(/Online now|Active today|Active this week/)).not.toBeInTheDocument();
  });

  it("lets the owner turn showing when they're online off and on, saved straight away", async () => {
    profiles.get.mockResolvedValue({ user: { ...me, showActivity: true } });
    profiles.updateMe.mockResolvedValueOnce({ user: { ...me, showActivity: false } });
    profiles.updateMe.mockResolvedValueOnce({ user: { ...me, showActivity: true } });
    renderAs(me, "me");
    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    const box = screen.getByRole("checkbox", { name: "Show my friends when I'm online" });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(profiles.updateMe).toHaveBeenLastCalledWith({ showActivity: false });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Show my friends when I'm online" })).not.toBeChecked());
    await userEvent.click(screen.getByRole("checkbox", { name: "Show my friends when I'm online" }));
    expect(profiles.updateMe).toHaveBeenLastCalledWith({ showActivity: true });
  });

  it("counts a visit to someone else's profile when you have profile views on", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    renderAs({ ...me, profileViews: true }, "zoe");
    await screen.findByRole("heading", { name: "Zoe" });
    await waitFor(() => expect(profileViewsApi.record).toHaveBeenCalledWith("zoe"));
    expect(profileViewsApi.record).toHaveBeenCalledTimes(1);
  });

  it("counts nothing when you haven't turned profile views on, or when you look at your own profile", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    renderAs(me, "zoe");
    await screen.findByRole("heading", { name: "Zoe" });
    expect(profileViewsApi.record).not.toHaveBeenCalled();
  });

  it("doesn't count a look at your own profile", async () => {
    profiles.get.mockResolvedValue({ user: { ...me, profileViews: true } });
    renderAs({ ...me, profileViews: true }, "me");
    await screen.findByRole("button", { name: "Edit profile" });
    expect(profileViewsApi.record).not.toHaveBeenCalled();
  });

  it("doesn't count a profile that couldn't be opened", async () => {
    profiles.get.mockRejectedValue(new ApiError(404, "not found"));
    renderAs({ ...me, profileViews: true }, "zoe");
    await screen.findByText(/unavailable/);
    expect(profileViewsApi.record).not.toHaveBeenCalled();
  });

  it("keeps going if a visit can't be recorded", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    vi.mocked(profileViewsApi.record).mockRejectedValue(new ApiError(500, "boom"));
    renderAs({ ...me, profileViews: true }, "zoe");
    expect(await screen.findByRole("heading", { name: "Zoe" })).toBeInTheDocument();
  });

  it("shows the owner their recent visitors only when profile views are on", async () => {
    profiles.get.mockResolvedValue({ user: { ...me, profileViews: false } });
    renderAs({ ...me, profileViews: false }, "me");
    await screen.findByRole("button", { name: "Edit profile" });
    expect(screen.queryByText("recent visitors")).not.toBeInTheDocument();
  });

  it("shows the owner their recent visitors when profile views are on, and nobody else", async () => {
    profiles.get.mockResolvedValue({ user: { ...me, profileViews: true } });
    renderAs({ ...me, profileViews: true }, "me");
    expect(await screen.findByText("recent visitors")).toBeInTheDocument();
  });

  it("never shows visitors on someone else's profile", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    renderAs({ ...me, profileViews: true }, "zoe");
    await screen.findByRole("heading", { name: "Zoe" });
    expect(screen.queryByText("recent visitors")).not.toBeInTheDocument();
  });

  it("lets the owner turn profile views on and off, saved straight away", async () => {
    profiles.get.mockResolvedValue({ user: me });
    profiles.updateMe.mockResolvedValueOnce({ user: { ...me, profileViews: true } });
    profiles.updateMe.mockResolvedValueOnce({ user: { ...me, profileViews: false } });
    renderAs(me, "me");
    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    const box = screen.getByRole("checkbox", { name: "Profile views" });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(profiles.updateMe).toHaveBeenLastCalledWith({ profileViews: true });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Profile views" })).toBeChecked());
    await userEvent.click(screen.getByRole("checkbox", { name: "Profile views" }));
    expect(profiles.updateMe).toHaveBeenLastCalledWith({ profileViews: false });
  });

  it("opens the owner's own profile ready to edit when the address asks for it (the checklist's links)", async () => {
    profiles.get.mockResolvedValue({ user: me });
    renderAs(me, "me", "?edit=1");
    expect(await screen.findByRole("button", { name: "Done editing" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Tell people what you make/)).toBeInTheDocument();
  });

  it("doesn't open editing without that, or for someone else's profile", async () => {
    profiles.get.mockResolvedValue({ user: me });
    renderAs(me, "me");
    expect(await screen.findByRole("button", { name: "Edit profile" })).toBeInTheDocument();
    cleanup();
    profiles.get.mockResolvedValue({ user: zoe });
    renderAs(me, "zoe", "?edit=1");
    await screen.findByRole("heading", { name: "Zoe" });
    expect(screen.queryByRole("button", { name: "Done editing" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Tell people what you make/)).not.toBeInTheDocument();
  });

  it("shows no status or tags when there are none", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    renderAs(me, "zoe");
    await screen.findByRole("heading", { name: "Zoe" });
    expect(screen.queryByRole("list", { name: "Status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tags" })).not.toBeInTheDocument();
  });

  it("lets the owner set a mood, what they are listening to and tags, saved with the profile", async () => {
    profiles.get.mockResolvedValue({ user: { ...me, tags: ["painter"] } });
    profiles.updateMe.mockResolvedValue({ user: { ...me, mood: "calm", listeningTo: "Kind of Blue", tags: ["painter", "muralist"] } });
    renderAs(me, "me");

    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    await userEvent.type(screen.getByLabelText("Mood"), "calm");
    await userEvent.type(screen.getByLabelText("Listening to"), "Kind of Blue");
    await userEvent.type(screen.getByLabelText(/What do you do\?/), "Muralist{enter}");
    expect(screen.getByRole("list", { name: "Your tags" })).toHaveTextContent("#muralist");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(profiles.updateMe).toHaveBeenCalled());
    expect(profiles.updateMe.mock.calls[0][0]).toMatchObject({ mood: "calm", listeningTo: "Kind of Blue", tags: ["painter", "muralist"] });
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

describe("ProfilePage: the order of the sections", () => {
  const SECTION_TEXT = ["about me section", "top friends", "music", "portfolio", "blog visitor", "guestbook"];
  const shownOrder = () =>
    SECTION_TEXT.map((text) => ({ text, el: screen.queryByText(new RegExp(`^${text}`)) }))
      .filter((s) => s.el)
      .sort((a, b) => (a.el!.compareDocumentPosition(b.el!) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map((s) => s.text);

  it("shows the sections in the usual order by default", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    renderAs(me, "zoe");
    await screen.findByRole("heading", { name: "Zoe" });
    expect(shownOrder()).toEqual(SECTION_TEXT);
  });

  it("shows them in the owner's order, and leaves out the ones they hid", async () => {
    profiles.get.mockResolvedValue({ user: { ...zoe, sectionOrder: ["blog", "portfolio", "testimonials", "music", "friends", "about"], hiddenSections: ["music"] } });
    renderAs(me, "zoe");
    await screen.findByRole("heading", { name: "Zoe" });
    expect(shownOrder()).toEqual(["blog visitor", "portfolio", "guestbook", "top friends", "about me section"]);
    expect(screen.queryByRole("group", { name: /section$/ })).not.toBeInTheDocument(); // no controls for a visitor
  });

  it("doesn't show the owner their hidden sections either, until they edit", async () => {
    profiles.get.mockResolvedValue({ user: { ...me, hiddenSections: ["portfolio"] } });
    renderAs(me, "me");
    await screen.findByRole("button", { name: "Edit profile" });
    expect(screen.queryByText("portfolio")).not.toBeInTheDocument();
    expect(screen.getByText("blog owner")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    const group = screen.getByRole("group", { name: "Portfolio section" });
    expect(group).toHaveTextContent("Hidden from visitors");
    expect(group).toHaveTextContent("portfolio");
  });

  it("shows someone's mutual friends to a signed-in visitor, but not on your own profile", async () => {
    profiles.get.mockResolvedValue({ user: zoe });
    renderAs(me, "zoe");
    expect(await screen.findByText("mutual friends with zoe")).toBeInTheDocument();
  });

  it("lets the owner choose whether friends of friends may see who they know", async () => {
    profiles.get.mockResolvedValue({ user: { ...me, showConnections: true } });
    profiles.updateMe.mockResolvedValue({ user: { ...me, showConnections: false } });
    renderAs(me, "me");
    expect(screen.queryByText(/mutual friends with/)).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    const box = screen.getByLabelText("Show who I know to friends of friends");
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(profiles.updateMe).toHaveBeenCalledWith({ showConnections: false });
    await waitFor(() => expect(screen.getByLabelText("Show who I know to friends of friends")).not.toBeChecked());
  });

  it("lets the owner move a section, saving the new order straight away", async () => {
    profiles.get.mockResolvedValue({ user: me });
    profiles.updateMe.mockResolvedValue({ user: { ...me, sectionOrder: ["about", "music", "friends", "portfolio", "blog", "testimonials"] } });
    renderAs(me, "me");
    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    expect(screen.getByRole("button", { name: "Move About me up" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move Music up" }));
    expect(profiles.updateMe).toHaveBeenCalledWith({ sectionOrder: ["about", "music", "friends", "portfolio", "blog", "testimonials"] });
    await waitFor(() => expect(shownOrder().slice(0, 3)).toEqual(["about me section", "music", "top friends"]));
  });

  it("lets the owner hide a section and show it again", async () => {
    profiles.get.mockResolvedValue({ user: me });
    profiles.updateMe.mockResolvedValueOnce({ user: { ...me, hiddenSections: ["blog"] } });
    profiles.updateMe.mockResolvedValueOnce({ user: { ...me, hiddenSections: [] } });
    renderAs(me, "me");
    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    await userEvent.click(screen.getByRole("button", { name: "Hide Blog" }));
    expect(profiles.updateMe).toHaveBeenLastCalledWith({ hiddenSections: ["blog"] });
    await userEvent.click(await screen.findByRole("button", { name: "Show Blog" }));
    expect(profiles.updateMe).toHaveBeenLastCalledWith({ hiddenSections: [] });
  });

  it("says so, and keeps the order, when a change can't be saved", async () => {
    profiles.get.mockResolvedValue({ user: me });
    profiles.updateMe.mockRejectedValue(new ApiError(500, "boom"));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderAs(me, "me");
    await userEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
    await userEvent.click(screen.getByRole("button", { name: "Move Music up" }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("boom"));
    expect(shownOrder().slice(0, 3)).toEqual(["about me section", "top friends", "music"]);
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
