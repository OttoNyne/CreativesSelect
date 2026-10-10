import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmbedCode, embedSnippet } from "./EmbedCode";
import { EmbedPiecePanel } from "./EmbedPiecePanel";
import { profilesApi } from "../../api/profiles.api";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../api/client";
import type { MediaItem, User } from "../../types";

vi.mock("../../api/profiles.api", () => ({ profilesApi: { updateMe: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const updateMe = vi.mocked(profilesApi.updateMe);
const piece = { id: "p1", caption: "A vase" } as MediaItem;

function signedIn(over: Partial<User> = {}) {
  const setUser = vi.fn();
  vi.mocked(useAuth).mockReturnValue({ user: { id: "me", username: "zoe", displayName: "Zoe", ...over } as User, isLoading: false, setUser, refresh: async () => {} });
  return setUser;
}

beforeEach(() => {
  updateMe.mockReset();
});

describe("embedSnippet", () => {
  it("is an iframe to this site's own card, with the title safely quoted", () => {
    const code = embedSnippet("piece", "abc123", 'A "vase" <b>', "https://www.creativesselect.com");
    expect(code).toBe('<iframe src="https://www.creativesselect.com/embed/piece/abc123" title="A &quot;vase&quot; &lt;b&gt;" width="480" height="420" style="border:0;max-width:100%" loading="lazy"></iframe>');
    expect(embedSnippet("profile", "zoe", "Zoe", "https://x.test")).toContain('src="https://x.test/embed/profile/zoe"');
  });
});

describe("EmbedCode", () => {
  it("previews the card and offers the text to copy", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    render(<EmbedCode kind="piece" id="p1" title="A vase" />);
    expect(screen.getByTitle("Preview of the embedded card")).toHaveAttribute("src", "/embed/piece/p1");
    const box = screen.getByLabelText("Copy this into the page") as HTMLTextAreaElement;
    expect(box.value).toContain("/embed/piece/p1");
    expect(box).toHaveAttribute("readonly");
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(write).toHaveBeenCalledWith(box.value);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});

describe("EmbedPiecePanel", () => {
  it("is off to begin with: offers to switch embedding on, and shows no code until then", async () => {
    const setUser = signedIn();
    updateMe.mockResolvedValue({ user: { id: "me", username: "zoe", displayName: "Zoe", allowEmbeds: true } as User });
    render(<EmbedPiecePanel item={piece} />);
    expect(screen.queryByLabelText("Copy this into the page")).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "Let my pieces and profile card be shown on other websites" }));
    expect(updateMe).toHaveBeenCalledWith({ allowEmbeds: true });
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ allowEmbeds: true })));
  });

  it("shows the code for this piece once allowed", () => {
    signedIn({ allowEmbeds: true });
    render(<EmbedPiecePanel item={piece} />);
    expect(screen.getByRole("checkbox", { name: /Let my pieces/ })).toBeChecked();
    expect((screen.getByLabelText("Copy this into the page") as HTMLTextAreaElement).value).toContain("/embed/piece/p1");
  });

  it("says why it can't be switched on, and why a save failed", async () => {
    signedIn({ isPrivate: true });
    const { unmount } = render(<EmbedPiecePanel item={piece} />);
    expect(screen.getByText("Your profile is private, so nothing of yours can be embedded.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    unmount();
    signedIn();
    updateMe.mockRejectedValue(new ApiError(400, "allowEmbeds must be true or false"));
    render(<EmbedPiecePanel item={piece} />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(await screen.findByRole("alert")).toHaveTextContent("allowEmbeds must be true or false");
  });
});
