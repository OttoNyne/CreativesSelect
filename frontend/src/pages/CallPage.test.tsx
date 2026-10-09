import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CallPage } from "./CallPage";
import { callsApi } from "../api/calls.api";
import { mediaApi } from "../api/media.api";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import { moderationApi } from "../api/moderation.api";
import type { CallApplicationRow, MediaItem, OpenCall, User } from "../types";

vi.mock("../api/calls.api", () => ({ callsApi: { get: vi.fn(), update: vi.fn(), remove: vi.fn(), apply: vi.fn(), withdraw: vi.fn(), applications: vi.fn(), answer: vi.fn(), matches: vi.fn() } }));
vi.mock("../api/media.api", () => ({ mediaApi: { byUser: vi.fn() }, uploadFile: vi.fn() }));
vi.mock("../api/moderation.api", () => ({ moderationApi: { report: vi.fn().mockResolvedValue({ report: {} }) } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(callsApi);

const owner = { id: "u2", username: "zoe", displayName: "Zoe", avatarUrl: null, csVerified: false };
const base = (over: Partial<OpenCall> = {}): OpenCall => ({
  id: "c1",
  title: "A vocalist for an EP",
  details: "Looking for a warm alto for three songs.",
  lookingFor: ["vocalist", "alto"],
  budget: "unpaid, credit",
  deadline: "2099-01-31",
  status: "open",
  closed: false,
  createdAt: "",
  owner,
  mine: false,
  match: [],
  applied: null,
  myApplication: null,
  ...over,
});
const piece = (id: string, caption: string): MediaItem => ({ id, ownerId: "me", url: `https://images.example.com/${id}.jpg`, type: "image", caption, isAiImage: false, reactions: { counts: {}, total: 0, mine: null }, createdAt: "" }) as MediaItem;
const row = (id: string, name: string, over: Partial<CallApplicationRow> = {}): CallApplicationRow => ({
  id,
  applicant: { id: `u-${id}`, username: name.toLowerCase(), displayName: name, avatarUrl: null, csVerified: false },
  note: `${name} sings alto`,
  piece: null,
  status: "waiting",
  reply: "",
  createdAt: "",
  ...over,
});

function show() {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "me", username: "me", displayName: "Me" } as User, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
  render(
    <MemoryRouter initialEntries={["/calls/c1"]}>
      <Routes>
        <Route path="/calls/:id" element={<CallPage />} />
        <Route path="/calls" element={<div>The calls list</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.get.mockResolvedValue({ call: base() });
  vi.mocked(mediaApi.byUser).mockResolvedValue({ media: [piece("p1", "My demo"), piece("p2", "My cover")] });
  api.applications.mockResolvedValue({ applications: [] });
  api.matches.mockResolvedValue({ people: [] });
  window.confirm = vi.fn(() => true);
});

describe("CallPage: someone else's call", () => {
  it("shows what it asks for, the roles that fit you, the terms and the last day", async () => {
    api.get.mockResolvedValue({ call: base({ match: ["alto"] }) });
    show();
    expect(await screen.findByRole("heading", { name: "A vocalist for an EP" })).toBeInTheDocument();
    expect(screen.getByText("Looking for a warm alto for three songs.")).toBeInTheDocument();
    expect(screen.getByText("Fits what you offer: alto")).toBeInTheDocument();
    expect(screen.getByText(/Budget or terms: unpaid, credit/)).toBeInTheDocument();
    expect(screen.getByText(/Answer by/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close call" })).toBeNull();
  });

  it("answers with words and one of your own pieces", async () => {
    api.apply.mockResolvedValue({ application: { id: "a1", status: "waiting" } });
    api.get.mockResolvedValueOnce({ call: base() }).mockResolvedValueOnce({ call: base({ applied: "waiting", myApplication: { id: "a1", note: "I sing alto", status: "waiting", reply: "", pieceId: "p2" } }) });
    show();
    await userEvent.type(await screen.findByLabelText("A few words about why you fit"), "  I sing alto ");
    await userEvent.click(await screen.findByRole("radio", { name: "My cover" }));
    await userEvent.click(screen.getByRole("button", { name: "Send answer" }));
    expect(api.apply).toHaveBeenCalledWith("c1", { note: "I sing alto", piece: "p2" });
    expect(await screen.findByRole("heading", { name: /Your answer: Waiting/ })).toBeInTheDocument();
    expect(screen.getByText("I sing alto")).toBeInTheDocument();
  });

  it("asks for words or a piece, and says why a send failed", async () => {
    api.apply.mockRejectedValue(new ApiError(409, "This call is closed"));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Send answer" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Write a few words or choose a piece.");
    expect(api.apply).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("A few words about why you fit"), "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send answer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This call is closed");
  });

  it("says when you have no pieces to show", async () => {
    vi.mocked(mediaApi.byUser).mockResolvedValue({ media: [] });
    show();
    expect(await screen.findByText(/You have no portfolio pieces yet/)).toBeInTheDocument();
  });

  it("shows how your answer went, with the owner's note, and lets you withdraw one that is waiting", async () => {
    const mine = { id: "a1", note: "I sing alto", status: "waiting" as const, reply: "", pieceId: null };
    api.get.mockResolvedValueOnce({ call: base({ applied: "waiting", myApplication: mine }) }).mockResolvedValueOnce({ call: base() });
    api.withdraw.mockResolvedValue(undefined as never);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Withdraw answer" }));
    expect(api.withdraw).toHaveBeenCalledWith("c1");
    expect(await screen.findByRole("button", { name: "Send answer" })).toBeInTheDocument();
  });

  it("shows a chosen answer with the note and no way to withdraw", async () => {
    api.get.mockResolvedValue({ call: base({ applied: "chosen", myApplication: { id: "a1", note: "Me", status: "chosen", reply: "Let's talk", pieceId: null } }) });
    show();
    expect(await screen.findByRole("heading", { name: /Your answer: Chosen/ })).toBeInTheDocument();
    expect(screen.getByText("Let's talk")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw answer" })).toBeNull();
  });

  it("offers no way to answer a closed call you hadn't answered", async () => {
    api.get.mockResolvedValue({ call: base({ closed: true, status: "closed" }) });
    show();
    expect(await screen.findByText("Closed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send answer" })).toBeNull();
  });

  it("lets you report someone else's call, and not your own", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Report this call" }));
    await userEvent.type(screen.getByLabelText("What's the issue?"), "Spam");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(moderationApi.report).toHaveBeenCalledWith("call", "c1", "Spam");
  });

  it("says when the call isn't there", async () => {
    api.get.mockRejectedValue(new ApiError(404, "Call not found"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("This call isn't available.");
    expect(screen.getByRole("link", { name: "← All calls" })).toHaveAttribute("href", "/calls");
  });
});

describe("CallPage: your own call", () => {
  const mineCall = (over: Partial<OpenCall> = {}) => base({ mine: true, applicantCount: 2, waitingCount: 2, ...over });

  it("shows the answers, and chooses one with a note, which the applicant will see", async () => {
    api.get.mockResolvedValue({ call: mineCall() });
    api.applications.mockResolvedValue({ applications: [row("a1", "Kai", { piece: { id: "p9", url: "https://images.example.com/kai.jpg", type: "image", caption: "Kai demo" } }), row("a2", "Liv")] });
    api.answer.mockResolvedValue({ application: { id: "a1", status: "chosen", reply: "Let's talk" } });
    show();
    const panel = await screen.findByRole("region", { name: "Answers" });
    expect(await within(panel).findByText("Kai sings alto")).toBeInTheDocument();
    expect(within(panel).getByRole("img", { name: "Kai demo" })).toBeInTheDocument();
    await userEvent.type(within(panel).getByRole("textbox", { name: "A note for Kai (optional)" }), "Let's talk");
    await userEvent.click(within(panel).getByRole("button", { name: "Choose Kai" }));
    expect(api.answer).toHaveBeenCalledWith("c1", "a1", true, "Let's talk");
    expect(await within(panel).findByText("Chosen")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Choose Kai" })).toBeNull();
    expect(within(panel).getByRole("button", { name: "Choose Liv" })).toBeInTheDocument();
  });

  it("lets the owner report an answer", async () => {
    api.get.mockResolvedValue({ call: mineCall() });
    api.applications.mockResolvedValue({ applications: [row("a1", "Kai")] });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Report this answer from Kai" }));
    await userEvent.type(screen.getByLabelText("What's the issue?"), "Abusive");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(moderationApi.report).toHaveBeenCalledWith("callApplication", "a1", "Abusive");
  });

  it("passes on an answer", async () => {
    api.get.mockResolvedValue({ call: mineCall() });
    api.applications.mockResolvedValue({ applications: [row("a2", "Liv")] });
    api.answer.mockResolvedValue({ application: { id: "a2", status: "passed", reply: "" } });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Pass on Liv's answer" }));
    expect(api.answer).toHaveBeenCalledWith("c1", "a2", false, undefined);
    expect(await screen.findByText("Not this time")).toBeInTheDocument();
  });

  it("says when nobody has answered, and lists the people who might fit, linking to their profiles", async () => {
    api.get.mockResolvedValue({ call: mineCall({ applicantCount: 0, waitingCount: 0 }) });
    api.matches.mockResolvedValue({ people: [{ id: "u5", username: "ann", displayName: "Ann", avatarUrl: null, csVerified: false, matched: ["alto"], workNote: "" }] });
    show();
    expect(await screen.findByText("Nobody has answered yet.")).toBeInTheDocument();
    const link = await screen.findByRole("link", { name: "View Ann's profile" });
    expect(link).toHaveAttribute("href", "/u/ann");
    expect(screen.getByText("Matches: alto")).toBeInTheDocument();
  });

  it("says when no one fits yet", async () => {
    api.get.mockResolvedValue({ call: mineCall() });
    show();
    expect(await screen.findByText("No one fits yet.")).toBeInTheDocument();
  });

  it("closes and reopens the call", async () => {
    api.get.mockResolvedValue({ call: mineCall() });
    api.update.mockResolvedValueOnce({ call: mineCall({ status: "closed", closed: true }) }).mockResolvedValueOnce({ call: mineCall() });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Close call" }));
    expect(api.update).toHaveBeenLastCalledWith("c1", { status: "closed" });
    await userEvent.click(await screen.findByRole("button", { name: "Reopen call" }));
    expect(api.update).toHaveBeenLastCalledWith("c1", { status: "open" });
    expect(await screen.findByRole("button", { name: "Close call" })).toBeInTheDocument();
  });

  it("says why it couldn't reopen", async () => {
    api.get.mockResolvedValue({ call: mineCall({ status: "closed", closed: true }) });
    api.update.mockRejectedValue(new ApiError(400, "The deadline has passed, so it can't be reopened"));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Reopen call" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("deadline has passed");
  });

  it("changes the call from the form", async () => {
    api.get.mockResolvedValue({ call: mineCall() });
    api.update.mockResolvedValue({ call: mineCall({ title: "A better title" }) });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Edit call" }));
    const title = screen.getByLabelText("Title");
    await userEvent.clear(title);
    await userEvent.type(title, "A better title");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(api.update).toHaveBeenCalledWith("c1", expect.objectContaining({ title: "A better title", lookingFor: ["vocalist", "alto"] }));
    expect(await screen.findByRole("heading", { name: "A better title" })).toBeInTheDocument();
  });

  it("deletes the call after asking, and goes back to the list", async () => {
    api.get.mockResolvedValue({ call: mineCall() });
    api.remove.mockResolvedValue(undefined as never);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Delete call" }));
    expect(window.confirm).toHaveBeenCalledWith("Delete this call and its answers?");
    expect(api.remove).toHaveBeenCalledWith("c1");
    await waitFor(() => expect(screen.getByText("The calls list")).toBeInTheDocument());
  });

  it("does nothing when you say no to deleting", async () => {
    window.confirm = vi.fn(() => false);
    api.get.mockResolvedValue({ call: mineCall() });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Delete call" }));
    expect(api.remove).not.toHaveBeenCalled();
  });
});
