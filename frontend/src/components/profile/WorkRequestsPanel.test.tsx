import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { WorkRequestsPanel } from "./WorkRequestsPanel";
import { workRequestsApi } from "../../api/workRequests.api";
import { ApiError } from "../../api/client";
import type { WorkRequest } from "../../types";

vi.mock("../../api/workRequests.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/workRequests.api")>()),
  workRequestsApi: { received: vi.fn(), sent: vi.fn(), answer: vi.fn(), remove: vi.fn() },
}));
const api = vi.mocked(workRequestsApi);
const person = (username: string) => ({ id: `id-${username}`, username, displayName: username.toUpperCase(), avatarUrl: null, csVerified: false });
const req = (id: string, over: Partial<WorkRequest> = {}): WorkRequest => ({ id, title: `Request ${id}`, details: "Warm colours please", budget: "", deadline: null, status: "open", reply: "", answeredAt: null, createdAt: "2026-10-01T10:00:00Z", from: person("bob"), ...over });
const sentReq = (id: string, over: Partial<WorkRequest> = {}): WorkRequest => ({ ...req(id, over), from: undefined, to: person("alice") });
const show = () => render(<MemoryRouter><WorkRequestsPanel /></MemoryRouter>);

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.received.mockResolvedValue({ requests: [] });
  api.sent.mockResolvedValue({ requests: [] });
});

describe("WorkRequestsPanel", () => {
  it("shows nothing while there are no requests either way, or when they can't be read", async () => {
    const first = show();
    await waitFor(() => expect(api.sent).toHaveBeenCalled());
    expect(screen.queryByRole("region")).toBeNull();
    first.unmount();
    api.received.mockRejectedValue(new ApiError(500, "x"));
    show();
    await waitFor(() => expect(api.received).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("shows what was asked, with the budget and deadline, and who asked", async () => {
    api.received.mockResolvedValue({ requests: [req("r1", { budget: "around 200", deadline: "2026-12-31T00:00:00Z" })] });
    show();
    const region = await screen.findByRole("region", { name: "Requests for work" });
    expect(region).toHaveTextContent("BOB");
    expect(region).toHaveTextContent("Request r1");
    expect(region).toHaveTextContent("Warm colours please");
    expect(region).toHaveTextContent("Budget: around 200");
    expect(region).toHaveTextContent("By ");
    expect(within(region).getByRole("link", { name: "BOB" })).toHaveAttribute("href", "/u/bob");
  });

  it("accepts with a note for the asker, and then shows the answer", async () => {
    api.received.mockResolvedValue({ requests: [req("r1")] });
    api.answer.mockResolvedValue({ request: { id: "r1", status: "accepted", reply: "Happy to", answeredAt: "" } });
    show();
    await userEvent.type(await screen.findByRole("textbox", { name: "Your note to them" }), "  Happy to ");
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(api.answer).toHaveBeenCalledWith("r1", true, "Happy to");
    expect(await screen.findByText(/You accepted this/)).toHaveTextContent("Happy to");
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("declines without a note", async () => {
    api.received.mockResolvedValue({ requests: [req("r1")] });
    api.answer.mockResolvedValue({ request: { id: "r1", status: "declined", reply: "", answeredAt: "" } });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Decline" }));
    expect(api.answer).toHaveBeenCalledWith("r1", false, undefined);
    expect(await screen.findByText("You declined this")).toBeInTheDocument();
  });

  it("says why an answer couldn't be saved, and keeps the request open", async () => {
    api.received.mockResolvedValue({ requests: [req("r1")] });
    api.answer.mockRejectedValue(new ApiError(409, "You've already answered that"));
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You've already answered that");
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
  });

  it("clears an answered request", async () => {
    api.received.mockResolvedValue({ requests: [req("r1", { status: "accepted", reply: "Yes" })] });
    api.remove.mockResolvedValue(undefined);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Clear" }));
    expect(api.remove).toHaveBeenCalledWith("r1");
    await waitFor(() => expect(screen.queryByText("Request r1")).toBeNull());
  });

  it("shows what you asked of others and how they answered, and lets you withdraw a waiting one", async () => {
    api.sent.mockResolvedValue({ requests: [sentReq("s1"), sentReq("s2", { status: "declined", reply: "Too busy" })] });
    api.remove.mockResolvedValue(undefined);
    show();
    const region = await screen.findByRole("region", { name: "Requests for work" });
    expect(region).toHaveTextContent("Requests you sent");
    expect(region).toHaveTextContent("Waiting for an answer");
    expect(region).toHaveTextContent("They declined — Too busy");
    expect(screen.getAllByRole("button", { name: "Withdraw" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(api.remove).toHaveBeenCalledWith("s1");
    await waitFor(() => expect(screen.queryByText("Request s1")).toBeNull());
  });
});
