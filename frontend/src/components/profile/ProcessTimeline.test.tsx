import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProcessTimeline } from "./ProcessTimeline";
import { PortfolioTile } from "./PortfolioTile";
import { processApi } from "../../api/process.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { moderationApi } from "../../api/moderation.api";
import type { MediaItem, ProcessStep } from "../../types";

vi.mock("../../api/process.api", () => ({ processApi: { steps: vi.fn(), add: vi.fn(), setWords: vi.fn(), removePicture: vi.fn(), remove: vi.fn(), reorder: vi.fn() } }));
vi.mock("../common/CommentPicturePicker", () => ({
  CommentPicturePicker: ({ url, onChange }: { url: string | null; onChange: (u: string | null) => void }) => (
    <button type="button" onClick={() => onChange(url ? null : "https://cdn.example.com/uploaded.png")}>
      {url ? "fake-remove-picture" : "fake-add-picture"}
    </button>
  ),
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../api/moderation.api", () => ({ moderationApi: { report: vi.fn() } }));
vi.mock("../../api/mentions.api", () => ({ mentionsApi: { suggest: vi.fn().mockResolvedValue({ people: [] }) } }));
vi.mock("../common/ReactionBar", () => ({ ReactionBar: () => null }));
vi.mock("./PieceCredits", () => ({ PieceCredits: () => null }));
vi.mock("../common/SaveButton", () => ({ SaveButton: () => null }));

const api = vi.mocked(processApi);
const piece = (over: Partial<MediaItem> = {}): MediaItem =>
  ({ id: "m1", ownerId: "me", url: "https://images.example.com/final.jpg", type: "image", caption: "A vase", isAiImage: false, reactions: { counts: {}, total: 0, mine: null }, createdAt: "", ...over }) as MediaItem;
const step = (id: string, content: string, imageUrl: string | null = null, position = 0): ProcessStep => ({ id, content, imageUrl, position, createdAt: "", editedAt: null });
const THREE = [step("s1", "First sketch", null, 0), step("s2", "Throwing the shape", "https://cdn.example.com/two.png", 1), step("s3", "Glaze test", null, 2)];

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "visitor", username: "visitor" } as never, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
  vi.mocked(moderationApi.report).mockReset().mockResolvedValue({ report: {} });
  Object.values(api).forEach((fn) => fn.mockReset());
  api.steps.mockResolvedValue({ steps: THREE });
  window.confirm = vi.fn(() => true);
});

describe("ProcessTimeline: walking through", () => {
  it("shows one step at a time, then the finished piece, and goes back", async () => {
    render(<ProcessTimeline piece={piece()} isOwner={false} onCountChange={vi.fn()} />);
    expect(await screen.findByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("First sketch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Throwing the shape")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Picture for step 2" })).toHaveAttribute("src", "https://cdn.example.com/two.png");
    await userEvent.click(screen.getByRole("button", { name: "Go to the finished piece" }));
    expect(screen.getByText("The finished piece")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "A vase" })).toHaveAttribute("src", "https://images.example.com/final.jpg");
    expect(screen.getByRole("button", { name: "Next step" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Go to step 1" }));
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("gives a visitor no way to change anything", async () => {
    render(<ProcessTimeline piece={piece()} isOwner={false} onCountChange={vi.fn()} />);
    await screen.findByText("Step 1 of 3");
    expect(screen.queryByText("Your steps")).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete step/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add step" })).toBeNull();
  });

  it("says when the steps can't be loaded", async () => {
    api.steps.mockRejectedValue(new ApiError(404, "Media item not found"));
    render(<ProcessTimeline piece={piece()} isOwner={false} onCountChange={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Media item not found");
  });
});

describe("ProcessTimeline: reporting a step", () => {
  it("lets a signed-in visitor report the step on screen, and never offers it to the owner or a signed-out visitor", async () => {
    const { unmount } = render(<ProcessTimeline piece={piece()} isOwner={false} onCountChange={vi.fn()} />);
    await screen.findByText("Step 1 of 3");
    await userEvent.click(screen.getByRole("button", { name: "Report this step" }));
    await userEvent.type(screen.getByLabelText("What's the issue?"), "Not appropriate");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(moderationApi.report).toHaveBeenCalledWith("processStep", "s1", "Not appropriate");
    expect(await screen.findByText("Thanks. A moderator will take a look.")).toBeInTheDocument();
    unmount();
    render(<ProcessTimeline piece={piece()} isOwner onCountChange={vi.fn()} />);
    await screen.findByText("Step 1 of 3");
    expect(screen.queryByRole("button", { name: "Report this step" })).toBeNull();
  });

  it("asks about the step that is showing, not the first one", async () => {
    render(<ProcessTimeline piece={piece()} isOwner={false} onCountChange={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Next step" }));
    await userEvent.click(screen.getByRole("button", { name: "Report this step" }));
    await userEvent.type(screen.getByLabelText("What's the issue?"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(moderationApi.report).toHaveBeenCalledWith("processStep", "s2", "x");
  });
});

describe("ProcessTimeline: the owner's steps", () => {
  it("explains what to do when there are none, and adds a step with words and a picture", async () => {
    api.steps.mockResolvedValue({ steps: [] });
    api.add.mockResolvedValue({ step: step("n1", "Rough sketch", "https://cdn.example.com/uploaded.png") });
    const onCount = vi.fn();
    render(<ProcessTimeline piece={piece()} isOwner onCountChange={onCount} />);
    expect(await screen.findByText(/visitors can walk through how this was made/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Words for the new step" }), "Rough sketch");
    await userEvent.click(screen.getByRole("button", { name: "fake-add-picture" }));
    await userEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(api.add).toHaveBeenCalledWith("m1", { content: "Rough sketch", imageUrl: "https://cdn.example.com/uploaded.png" });
    expect(onCount).toHaveBeenLastCalledWith(1);
    expect(await screen.findByText("Step 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Words for the new step" })).toHaveValue("");
  });

  it("asks for words or a picture before adding", async () => {
    api.steps.mockResolvedValue({ steps: [] });
    render(<ProcessTimeline piece={piece()} isOwner onCountChange={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Add step" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Write something or add a picture first.");
    expect(api.add).not.toHaveBeenCalled();
  });

  it("says why a step couldn't be added, and keeps what was written", async () => {
    api.steps.mockResolvedValue({ steps: [] });
    api.add.mockRejectedValue(new ApiError(400, "A piece can have up to 12 steps"));
    render(<ProcessTimeline piece={piece()} isOwner onCountChange={vi.fn()} />);
    await userEvent.type(await screen.findByRole("textbox", { name: "Words for the new step" }), "One more");
    await userEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 12 steps");
    expect(screen.getByRole("textbox", { name: "Words for the new step" })).toHaveValue("One more");
  });

  it("stops offering to add at twelve", async () => {
    api.steps.mockResolvedValue({ steps: Array.from({ length: 12 }, (_, i) => step(`s${i}`, `Step ${i}`, null, i)) });
    render(<ProcessTimeline piece={piece()} isOwner onCountChange={vi.fn()} />);
    await screen.findByText("Step 1 of 12");
    expect(screen.queryByRole("button", { name: "Add step" })).toBeNull();
  });

  it("puts a step in a new order", async () => {
    api.reorder.mockResolvedValue({ steps: [THREE[1], THREE[0], THREE[2]] });
    render(<ProcessTimeline piece={piece()} isOwner onCountChange={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Move step 1 down" }));
    expect(api.reorder).toHaveBeenCalledWith("m1", ["s2", "s1", "s3"]);
    expect(screen.getByRole("button", { name: "Move step 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move step 3 down" })).toBeDisabled();
  });

  it("changes a step's words", async () => {
    api.setWords.mockResolvedValue({ step: step("s1", "First, a sketch") });
    render(<ProcessTimeline piece={piece()} isOwner onCountChange={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit step 1" }));
    const box = screen.getByRole("textbox", { name: "Words of step 1" });
    await userEvent.clear(box);
    await userEvent.type(box, "First, a sketch");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.setWords).toHaveBeenCalledWith("s1", "First, a sketch");
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Words of step 1" })).toBeNull());
    expect(screen.getAllByText("First, a sketch").length).toBeGreaterThan(0);
  });

  it("takes a picture off a step", async () => {
    api.removePicture.mockResolvedValue({ step: step("s2", "Throwing the shape", null, 1) });
    render(<ProcessTimeline piece={piece()} isOwner onCountChange={vi.fn()} />);
    await screen.findByText("Step 1 of 3");
    const manage = screen.getByText("Your steps").closest("div")!;
    await userEvent.click(within(manage).getByRole("button", { name: "Remove picture" }));
    expect(api.removePicture).toHaveBeenCalledWith("s2");
    await waitFor(() => expect(within(manage).queryByRole("img", { name: "Picture for step 2" })).toBeNull());
  });

  it("deletes a step after asking, and counts what is left", async () => {
    api.remove.mockResolvedValue(undefined as never);
    const onCount = vi.fn();
    render(<ProcessTimeline piece={piece()} isOwner onCountChange={onCount} />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete step 3" }));
    expect(window.confirm).toHaveBeenCalledWith("Delete this step?");
    expect(api.remove).toHaveBeenCalledWith("s3");
    expect(onCount).toHaveBeenLastCalledWith(2);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete step 3" })).toBeNull());
  });

  it("does nothing when the person says no to deleting", async () => {
    window.confirm = vi.fn(() => false);
    render(<ProcessTimeline piece={piece()} isOwner onCountChange={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete step 1" }));
    expect(api.remove).not.toHaveBeenCalled();
  });
});

describe("a portfolio piece's process button", () => {
  const tile = (item: MediaItem, isOwner: boolean) =>
    render(<PortfolioTile item={item} isOwner={isOwner} canReact={false} onRemove={vi.fn()} onReact={vi.fn()} />);

  it("shows a visitor how many steps there are, and opens them", async () => {
    tile(piece({ processCount: 3 }), false);
    await userEvent.click(screen.getByRole("button", { name: "How it was made (3)" }));
    expect(await screen.findByText("Step 1 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "How it was made (3)" }));
    expect(screen.queryByText("Step 1 of 3")).toBeNull();
  });

  it("shows a visitor nothing for a piece with no steps", () => {
    tile(piece({ processCount: 0 }), false);
    expect(screen.queryByRole("button", { name: /How it was made/ })).toBeNull();
  });

  it("offers the owner a way to start", () => {
    tile(piece({ processCount: 0 }), true);
    expect(screen.getByRole("button", { name: "Show how it was made" })).toBeInTheDocument();
  });
});
