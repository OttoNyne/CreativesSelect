import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CallsPage } from "./CallsPage";
import { callsApi } from "../api/calls.api";
import { ApiError } from "../api/client";
import type { OpenCall } from "../types";

vi.mock("../api/calls.api", () => ({ callsApi: { board: vi.fn(), mine: vi.fn(), applied: vi.fn(), create: vi.fn(), update: vi.fn() } }));
const api = vi.mocked(callsApi);

const owner = { id: "u2", username: "zoe", displayName: "Zoe", avatarUrl: null, csVerified: false };
const call = (id: string, over: Partial<OpenCall> = {}): OpenCall => ({
  id,
  title: `Call ${id}`,
  details: "Looking for a warm alto for three songs.",
  lookingFor: ["vocalist"],
  budget: "",
  deadline: null,
  status: "open",
  closed: false,
  createdAt: "",
  owner,
  mine: false,
  ...over,
});

const show = () =>
  render(
    <MemoryRouter>
      <CallsPage />
    </MemoryRouter>
  );

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.board.mockResolvedValue({ calls: [call("c1"), call("c2")], hasMore: false, next: null });
  api.mine.mockResolvedValue({ calls: [] });
  api.applied.mockResolvedValue({ applications: [] });
});

describe("CallsPage", () => {
  it("lists the open calls, each linking to its page, with its roles and who is asking", async () => {
    show();
    const link = await screen.findByRole("link", { name: "Call c1" });
    expect(link).toHaveAttribute("href", "/calls/c1");
    expect(screen.getAllByText("by Zoe")).toHaveLength(2);
    expect(within(screen.getAllByRole("list", { name: "Roles it looks for" })[0]).getByText("vocalist")).toBeInTheDocument();
  });

  it("marks the roles that fit what you offer, and says so", async () => {
    api.board.mockResolvedValue({ calls: [call("c1", { match: ["vocalist"] })], hasMore: false, next: null });
    show();
    expect(await screen.findByText("Fits what you offer: vocalist")).toBeInTheDocument();
  });

  it("shows only the ones that fit under For you, and says what to do when there are none", async () => {
    show();
    await screen.findByRole("link", { name: "Call c1" });
    api.board.mockResolvedValue({ calls: [], hasMore: false, next: null });
    await userEvent.click(screen.getByRole("button", { name: "For you" }));
    expect(api.board).toHaveBeenLastCalledWith({ forMe: true });
    expect(await screen.findByText(/No open calls fit what you offer yet/)).toBeInTheDocument();
  });

  it("shows your own calls with how many answered, and what you answered with how it went", async () => {
    api.mine.mockResolvedValue({ calls: [call("m1", { mine: true, applicantCount: 3, waitingCount: 2 })] });
    api.applied.mockResolvedValue({ applications: [{ id: "a1", status: "chosen", reply: "", createdAt: "", call: call("x1") }] });
    show();
    await screen.findByRole("link", { name: "Call c1" });
    await userEvent.click(screen.getByRole("button", { name: "My calls" }));
    expect(await screen.findByText(/3 answers · 2 waiting/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "My answers" }));
    expect(await screen.findByText(/You answered: Chosen/)).toBeInTheDocument();
  });

  it("says when there is nothing", async () => {
    api.board.mockResolvedValue({ calls: [], hasMore: false, next: null });
    show();
    expect(await screen.findByText("No open calls right now.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "My calls" }));
    expect(await screen.findByText("You haven't posted a call.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "My answers" }));
    expect(await screen.findByText("You haven't answered any calls.")).toBeInTheDocument();
  });

  it("says when the calls can't be loaded", async () => {
    api.board.mockRejectedValue(new ApiError(500, "Server error"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Server error");
  });

  it("shows more when there are more", async () => {
    api.board.mockResolvedValueOnce({ calls: [call("c1")], hasMore: true, next: "c1" }).mockResolvedValueOnce({ calls: [call("c0")], hasMore: false, next: "c0" });
    show();
    await screen.findByRole("link", { name: "Call c1" });
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(api.board).toHaveBeenLastCalledWith({ forMe: false, before: "c1" });
    expect(await screen.findByRole("link", { name: "Call c0" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("posts a call from the form, says how many people who fit were told, and shows it under My calls", async () => {
    api.create.mockResolvedValue({ call: call("n1", { mine: true, title: "A vocalist" }), told: 4 });
    show();
    await screen.findByRole("link", { name: "Call c1" });
    await userEvent.click(screen.getByRole("button", { name: "Post a call" }));
    await userEvent.type(screen.getByLabelText("Title"), "A vocalist");
    await userEvent.type(screen.getByLabelText("What you are looking for"), "A warm alto");
    await userEvent.type(screen.getByRole("textbox", { name: /Looking for/ }), "Vocalist{Enter}");
    await userEvent.type(screen.getByLabelText("Budget or terms (optional)"), "unpaid");
    await userEvent.click(screen.getByRole("button", { name: "Post call" }));
    expect(api.create).toHaveBeenCalledWith({ title: "A vocalist", details: "A warm alto", lookingFor: ["vocalist"], budget: "unpaid", deadline: null });
    expect(await screen.findByText("Posted. 4 people who fit were told.")).toBeInTheDocument();
    await waitFor(() => expect(api.mine).toHaveBeenCalled());
  });

  it("keeps the form and says why when posting fails", async () => {
    api.create.mockRejectedValue(new ApiError(409, "You can have up to 5 open calls — close one first"));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Post a call" }));
    await userEvent.type(screen.getByLabelText("Title"), "Another");
    await userEvent.type(screen.getByLabelText("What you are looking for"), "Details");
    await userEvent.click(screen.getByRole("button", { name: "Post call" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 5 open calls");
    expect(screen.getByLabelText("Title")).toHaveValue("Another");
  });

  it("does not offer to post without a title and words, and takes at most five roles, one of each", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Post a call" }));
    expect(screen.getByRole("button", { name: "Post call" })).toBeDisabled();
    const roles = screen.getByRole("textbox", { name: /Looking for/ });
    await userEvent.type(roles, "vocalist{Enter}");
    await userEvent.type(roles, "vocalist{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(/already/i);
    for (const role of ["alto", "bass", "tenor", "drums"]) await userEvent.type(roles, `${role}{Enter}`);
    expect(screen.queryByRole("textbox", { name: /Looking for/ })).toBeNull(); // five is the most
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(5);
    await userEvent.click(screen.getByRole("button", { name: "Remove vocalist" }));
    expect(screen.getByRole("textbox", { name: /Looking for/ })).toBeInTheDocument();
  });
});
