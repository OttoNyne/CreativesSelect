import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ChallengeTile } from "./ChallengeTile";
import { mediaApi } from "../../api/media.api";
import { ApiError } from "../../api/client";
import type { ChallengeEntry, MediaItem } from "../../types";

vi.mock("../../api/media.api", () => ({ mediaApi: { react: vi.fn() } }));
const react = vi.mocked(mediaApi.react);
const empty = { counts: { like: 0, love: 0, laugh: 0, wow: 0, sad: 0, fire: 0 }, total: 0, mine: null };

function entry(item: Partial<MediaItem>): ChallengeEntry {
  return {
    id: "e1",
    item: { id: "m1", ownerId: "o", url: "https://img.example.com/a.png", type: "image", caption: "A vase", isAiImage: false, reactions: empty, createdAt: "", ...item } as MediaItem,
    owner: { id: "u1", username: "ann", displayName: "Ann", avatarUrl: null, csVerified: false },
    createdAt: "",
  };
}
const show = (e: ChallengeEntry, canReact = true) =>
  render(
    <MemoryRouter>
      <ul>
        <ChallengeTile entry={e} canReact={canReact} />
      </ul>
    </MemoryRouter>
  );

beforeEach(() => react.mockReset());

describe("ChallengeTile", () => {
  it("shows a picture with its caption and who made it, linked to their profile", () => {
    show(entry({}));
    expect(screen.getByRole("img", { name: "A vase" })).toHaveAttribute("src", "https://img.example.com/a.png");
    expect(screen.getByRole("link", { name: /by Ann/ })).toHaveAttribute("href", "/u/ann");
  });

  it("plays a video, and shows a linked YouTube video as an embed", () => {
    const { container, unmount } = show(entry({ type: "video", url: "https://cdn.example.com/v.mp4", durationSeconds: 10 }));
    expect(container.querySelector("video")).not.toBeNull();
    unmount();
    const second = show(entry({ type: "embed", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }));
    expect(second.container.querySelector("iframe")?.getAttribute("src")).toContain("youtube");
  });

  it("lets a signed-in person react and shows the new count, and says when that failed", async () => {
    react.mockResolvedValueOnce({ reactions: { ...empty, counts: { ...empty.counts, love: 1 }, total: 1, mine: "love" } });
    show(entry({}));
    await userEvent.click(screen.getByRole("button", { name: "Add a reaction" }));
    await userEvent.click(await screen.findByRole("button", { name: "Love" }));
    expect(react).toHaveBeenCalledWith("m1", "love");
    expect(await screen.findByRole("button", { name: "Love: 1, your reaction" })).toBeInTheDocument();
    react.mockRejectedValueOnce(new ApiError(429, "You're reacting too fast — try again in a bit"));
    await userEvent.click(screen.getByRole("button", { name: "Love: 1, your reaction" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("reacting too fast");
  });

  it("shows only the counts to someone who can't react", () => {
    show(entry({ reactions: { ...empty, counts: { ...empty.counts, fire: 2 }, total: 2, mine: null } }), false);
    expect(screen.getByRole("button", { name: "Fire: 2" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add a reaction" })).toBeNull();
  });
});

vi.mock("../../api/saves.api", () => ({ savesApi: { save: vi.fn().mockResolvedValue({ saved: true }), unsave: vi.fn().mockResolvedValue(undefined) } }));

describe("ChallengeTile: saving", () => {
  it("lets a signed-in person save the piece, and shows nothing to someone who can't", async () => {
    const { savesApi } = await import("../../api/saves.api");
    const first = show(entry({}));
    await userEvent.click(screen.getByRole("button", { name: "Save this piece" }));
    expect(savesApi.save).toHaveBeenCalledWith("pieces", "m1");
    expect(await screen.findByRole("button", { name: "Remove this piece from your saved list" })).toBeInTheDocument();
    first.unmount();
    show(entry({}), false);
    expect(screen.queryByRole("button", { name: /Save this piece/ })).toBeNull();
  });
});
