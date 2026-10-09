import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CritiquePage } from "./CritiquePage";
import { CritiquesPage } from "./CritiquesPage";
import { AskFeedback } from "../components/critique/AskFeedback";
import { critiquesApi } from "../api/critiques.api";
import { moderationApi } from "../api/moderation.api";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import type { Critique, CritiqueNote, MediaItem, User } from "../types";

vi.mock("../api/critiques.api", () => ({ critiquesApi: { board: vi.fn(), mine: vi.fn(), answered: vi.fn(), ask: vi.fn(), get: vi.fn(), update: vi.fn(), remove: vi.fn(), give: vi.fn(), editMine: vi.fn(), withdrawMine: vi.fn(), thank: vi.fn(), removeNote: vi.fn() } }));
vi.mock("../api/moderation.api", () => ({ moderationApi: { report: vi.fn().mockResolvedValue({ report: {} }) } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(critiquesApi);

const owner = { id: "u-owner", username: "zoe", displayName: "Zoe", avatarUrl: null, csVerified: false };
const note = (id: string, over: Partial<CritiqueNote> = {}): CritiqueNote => ({ id, working: "The colours", change: "The edges", thanked: false, createdAt: "", editedAt: null, ...over });
const critique = (over: Partial<Critique> = {}): Critique => ({
  id: "q1",
  question: "Is the glaze too loud?",
  status: "open",
  closed: false,
  createdAt: "",
  owner,
  mine: false,
  piece: { id: "p1", url: "https://images.example.com/vase.jpg", type: "image", caption: "A vase" },
  noteCount: 0,
  myNote: null,
  ...over,
});

function show(path = "/critiques/q1") {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "me", username: "me", displayName: "Me" } as User, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/critiques" element={<CritiquesPage />} />
        <Route path="/critiques/:id" element={<CritiquePage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.get.mockResolvedValue({ critique: critique() });
  window.confirm = vi.fn(() => true);
  vi.mocked(moderationApi.report).mockClear();
});

describe("CritiquePage: someone giving feedback", () => {
  it("shows the piece and the question, and how many have answered, but nobody's feedback", async () => {
    api.get.mockResolvedValue({ critique: critique({ noteCount: 3 }) });
    show();
    expect(await screen.findByRole("heading", { name: "Is the glaze too loud?" })).toBeInTheDocument();
    expect(screen.getByText("Zoe asks:")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "The piece: A vase" })).toHaveAttribute("src", "https://images.example.com/vase.jpg");
    expect(screen.getByText("3 people gave feedback")).toBeInTheDocument();
    expect(screen.getByText("Only the maker and you can read this.")).toBeInTheDocument();
    expect(screen.queryByText("Feedback you received")).toBeNull();
  });

  it("sends two notes, and then shows them as yours with ways to change or take them back", async () => {
    api.give.mockResolvedValue({ note: note("n1", { working: "Lovely shape", change: "" }) });
    show();
    await userEvent.type(await screen.findByLabelText("What is working"), "  Lovely shape ");
    await userEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(api.give).toHaveBeenCalledWith("q1", { working: "Lovely shape", change: "" });
    expect(await screen.findByRole("region", { name: "Your feedback" })).toBeInTheDocument();
    expect(screen.getByText("Lovely shape")).toBeInTheDocument();
    expect(screen.getByText("1 person gave feedback")).toBeInTheDocument();
    expect(screen.queryByText("What I would change")).toBeNull(); // the empty half is left out
    expect(screen.getByRole("button", { name: "Edit my feedback" })).toBeInTheDocument();
  });

  it("asks for something in at least one box, and says why a send failed", async () => {
    api.give.mockRejectedValue(new ApiError(409, "You have already given feedback on this"));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Send feedback" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Write something in at least one of the boxes.");
    expect(api.give).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("What I would change"), "The edges");
    await userEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already given feedback");
  });

  it("edits what you gave, and takes it back", async () => {
    api.get.mockResolvedValue({ critique: critique({ noteCount: 1, myNote: note("n1") }) });
    api.editMine.mockResolvedValue({ note: note("n1", { working: "Even better", change: "The edges" }) });
    api.withdrawMine.mockResolvedValue(undefined as never);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Edit my feedback" }));
    const box = screen.getByLabelText("What is working");
    await userEvent.clear(box);
    await userEvent.type(box, "Even better");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.editMine).toHaveBeenCalledWith("q1", { working: "Even better", change: "The edges" });
    expect(await screen.findByText("Even better")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Take my feedback back" }));
    expect(api.withdrawMine).toHaveBeenCalledWith("q1");
    expect(await screen.findByRole("button", { name: "Send feedback" })).toBeInTheDocument();
  });

  it("tells you when the maker said thanks, and offers no changes once the request is closed", async () => {
    api.get.mockResolvedValue({ critique: critique({ noteCount: 1, status: "closed", closed: true, myNote: note("n1", { thanked: true }) }) });
    show();
    expect(await screen.findByText("✓ The maker said thanks.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit my feedback" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Take my feedback back" })).toBeNull();
  });

  it("offers no form on a closed request you hadn't answered, and can report the request", async () => {
    api.get.mockResolvedValue({ critique: critique({ status: "closed", closed: true }) });
    show();
    await screen.findByText("Closed");
    expect(screen.queryByRole("button", { name: "Send feedback" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Report this request" }));
    await userEvent.type(screen.getByLabelText("What's the issue?"), "Spam");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(moderationApi.report).toHaveBeenCalledWith("critique", "q1", "Spam");
  });

  it("says when the request isn't there", async () => {
    api.get.mockRejectedValue(new ApiError(404, "Request not found"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("This request isn't available.");
  });
});

describe("CritiquePage: the maker", () => {
  const mine = (over: Partial<Critique> = {}) =>
    critique({
      mine: true,
      noteCount: 2,
      notes: [
        note("n1", { working: "Lovely shape", change: "", author: { id: "u-kai", username: "kai", displayName: "Kai", avatarUrl: null, csVerified: false } }),
        note("n2", { working: "", change: "Softer edges", author: { id: "u-liv", username: "liv", displayName: "Liv", avatarUrl: null, csVerified: false } }),
      ],
      ...over,
    });

  it("reads all the feedback with who wrote it, and has no form of its own", async () => {
    api.get.mockResolvedValue({ critique: mine() });
    show();
    const section = await screen.findByRole("region", { name: "Feedback you received" });
    expect(within(section).getByText("Kai")).toBeInTheDocument();
    expect(within(section).getByText("Lovely shape")).toBeInTheDocument();
    expect(within(section).getByText("Softer edges")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send feedback" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Report this request" })).toBeNull();
  });

  it("says thanks, takes a note away after asking, and reports one", async () => {
    api.get.mockResolvedValueOnce({ critique: mine() }).mockResolvedValueOnce({ critique: mine({ noteCount: 1, notes: mine().notes!.slice(1) }) });
    api.thank.mockResolvedValue({ note: note("n1", { thanked: true }) });
    api.removeNote.mockResolvedValue(undefined as never);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Say thanks to Kai" }));
    expect(api.thank).toHaveBeenCalledWith("q1", "n1");
    expect(await screen.findByText("✓ Thanked")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Report this feedback from Liv" }));
    await userEvent.type(screen.getByLabelText("What's the issue?"), "Abusive");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(moderationApi.report).toHaveBeenCalledWith("critiqueNote", "n2", "Abusive");
    await userEvent.click(screen.getByRole("button", { name: "Remove feedback from Kai" }));
    expect(window.confirm).toHaveBeenCalledWith("Remove this feedback?");
    expect(api.removeNote).toHaveBeenCalledWith("q1", "n1");
    await waitFor(() => expect(screen.queryByText("Lovely shape")).toBeNull());
  });

  it("says when nobody has given feedback", async () => {
    api.get.mockResolvedValue({ critique: mine({ noteCount: 0, notes: [] }) });
    show();
    expect(await screen.findByText("Nobody has given feedback yet.")).toBeInTheDocument();
  });

  it("closes and reopens the request", async () => {
    api.get.mockResolvedValue({ critique: mine() });
    api.update.mockResolvedValueOnce({ critique: mine({ status: "closed", closed: true }) }).mockResolvedValueOnce({ critique: mine() });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Close request" }));
    expect(api.update).toHaveBeenLastCalledWith("q1", { status: "closed" });
    await userEvent.click(await screen.findByRole("button", { name: "Reopen request" }));
    expect(api.update).toHaveBeenLastCalledWith("q1", { status: "open" });
    expect(await screen.findByRole("button", { name: "Close request" })).toBeInTheDocument();
  });

  it("says why it couldn't reopen", async () => {
    api.get.mockResolvedValue({ critique: mine({ status: "closed", closed: true }) });
    api.update.mockRejectedValue(new ApiError(409, "This piece already has an open request"));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Reopen request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already has an open request");
  });

  it("deletes the request after asking and goes back to the list", async () => {
    api.get.mockResolvedValue({ critique: mine() });
    api.remove.mockResolvedValue(undefined as never);
    api.board.mockResolvedValue({ critiques: [], hasMore: false, next: null });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Delete request" }));
    expect(window.confirm).toHaveBeenCalledWith("Delete this request and the feedback on it?");
    expect(api.remove).toHaveBeenCalledWith("q1");
    expect(await screen.findByText("Nobody is asking for feedback right now.")).toBeInTheDocument();
  });
});

describe("CritiquesPage", () => {
  beforeEach(() => {
    api.board.mockResolvedValue({ critiques: [critique({ noteCount: 2, answered: true }), critique({ id: "q2", question: "", piece: { id: "p2", url: "https://images.example.com/b.jpg", type: "image", caption: "A bowl" } })], hasMore: false, next: null });
    api.mine.mockResolvedValue({ critiques: [] });
    api.answered.mockResolvedValue({ answers: [] });
  });

  it("lists the open requests with the question, how many answered and whether you did, each opening its page", async () => {
    show("/critiques");
    const link = await screen.findByRole("link", { name: "Is the glaze too loud?" });
    expect(link).toHaveAttribute("href", "/critiques/q1");
    expect(screen.getByText("2 people gave feedback")).toBeInTheDocument();
    expect(screen.getByText(/You gave feedback/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "What do you think?" })).toHaveAttribute("href", "/critiques/q2");
  });

  it("shows your own requests and the feedback you gave, and says when there are none", async () => {
    api.answered.mockResolvedValue({ answers: [{ note: note("n1"), critique: critique({ id: "q9", question: "Answered one" }) }] });
    show("/critiques");
    await screen.findByRole("link", { name: "Is the glaze too loud?" });
    await userEvent.click(screen.getByRole("button", { name: "My requests" }));
    expect(await screen.findByText("You haven't asked for feedback.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Feedback I gave" }));
    expect(await screen.findByRole("link", { name: "Answered one" })).toBeInTheDocument();
  });

  it("shows more when there are more, and says when the list can't be loaded", async () => {
    api.board.mockResolvedValueOnce({ critiques: [critique()], hasMore: true, next: "q1" }).mockResolvedValueOnce({ critiques: [critique({ id: "q0", question: "Older one" })], hasMore: false, next: "q0" });
    show("/critiques");
    await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(api.board).toHaveBeenLastCalledWith("q1");
    expect(await screen.findByRole("link", { name: "Older one" })).toBeInTheDocument();
    api.board.mockRejectedValue(new ApiError(500, "Server error"));
    await userEvent.click(screen.getByRole("button", { name: "My requests" }));
    await userEvent.click(screen.getByRole("button", { name: "Asking for feedback" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server error");
  });
});

describe("AskFeedback on a portfolio piece", () => {
  const piece = (over: Partial<MediaItem> = {}): MediaItem => ({ id: "p1", ownerId: "u", url: "https://images.example.com/a.jpg", type: "image", caption: "A vase", isAiImage: false, reactions: { counts: {}, total: 0, mine: null }, createdAt: "", ...over }) as MediaItem;
  const showTile = (item: MediaItem, isOwner: boolean, signedIn = true) =>
    render(
      <MemoryRouter>
        <AskFeedback item={item} isOwner={isOwner} signedIn={signedIn} />
      </MemoryRouter>
    );

  it("lets the owner ask, with a question, and then links to the request", async () => {
    api.ask.mockResolvedValue({ critique: critique({ id: "q7" }) });
    showTile(piece(), true);
    await userEvent.click(screen.getByRole("button", { name: "Ask for feedback on this piece" }));
    await userEvent.type(screen.getByLabelText("A question for them (optional)"), " Is the colour too loud? ");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(api.ask).toHaveBeenCalledWith("p1", "Is the colour too loud?");
    expect(await screen.findByRole("link", { name: "Feedback requested (0)" })).toHaveAttribute("href", "/critiques/q7");
  });

  it("can ask without a question, and says why it couldn't", async () => {
    api.ask.mockRejectedValue(new ApiError(409, "You can have up to 3 open requests — close one first"));
    showTile(piece(), true);
    await userEvent.click(screen.getByRole("button", { name: "Ask for feedback on this piece" }));
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(api.ask).toHaveBeenCalledWith("p1", undefined);
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 3 open requests");
  });

  it("shows the owner an open request with how many answered, and a signed-in visitor a way to give feedback", () => {
    const open = piece({ critique: { id: "q1", noteCount: 4 } });
    const { unmount } = showTile(open, true);
    expect(screen.getByRole("link", { name: "Feedback requested (4)" })).toHaveAttribute("href", "/critiques/q1");
    unmount();
    showTile(open, false);
    expect(screen.getByRole("link", { name: "Give feedback" })).toHaveAttribute("href", "/critiques/q1");
  });

  it("shows a visitor nothing when there is no request", () => {
    showTile(piece(), false);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
