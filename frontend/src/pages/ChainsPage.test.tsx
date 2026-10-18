import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ChainsPage } from "./ChainsPage";
import { chainsApi, type Chain, type WaitingChain } from "../api/chains.api";
import { ApiError } from "../api/client";

vi.mock("../api/chains.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/chains.api")>()),
  chainsApi: { open: vi.fn(), complete: vi.fn(), mine: vi.fn() },
}));
const api = vi.mocked(chainsApi);

const waiting = (id: string, prompt = "", nextPart = 2): WaitingChain => ({ id, prompt, count: nextPart - 1, parts: 3, nextPart, edgeUrl: `/api/chains/${id}/edge`, claimedByMe: false });
const artist = (name: string) => ({ id: name, username: name, displayName: name.toUpperCase(), avatarUrl: null, csVerified: false });
const finished = (id: string, prompt: string): Chain => ({
  id,
  prompt,
  status: "complete",
  complete: true,
  count: 3,
  parts: 3,
  completedAt: "2026-10-17T10:00:00Z",
  mine: false,
  sections: ["ann", "ben", "cat"].map((n, i) => ({ id: `${id}-${i}`, index: i, author: artist(n), imageUrl: `/api/chains/${id}/sections/${i}/image` })),
});
const mineChain = (id: string, prompt: string, complete: boolean): Chain => ({ ...finished(id, prompt), status: complete ? "complete" : "open", complete, count: complete ? 3 : 1, sections: complete ? finished(id, prompt).sections : [] });

function show() {
  render(
    <MemoryRouter>
      <ChainsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  [api.open, api.complete, api.mine].forEach((fn) => fn.mockReset());
  api.open.mockResolvedValue({ chains: [waiting("c1", "A tall cat"), waiting("c2", "", 3)], hasMore: false });
  api.complete.mockResolvedValue({ chains: [finished("d1", "Three friends")], hasMore: false });
  api.mine.mockResolvedValue({ chains: [mineChain("m1", "Mine waiting", false), mineChain("m2", "Mine done", true)] });
});

describe("ChainsPage", () => {
  it("explains the idea and offers to start a chain", async () => {
    show();
    expect(await screen.findByRole("heading", { name: "Drawing chains" })).toBeInTheDocument();
    expect(screen.getByText(/a drawing in three parts/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start a chain" })).toHaveAttribute("href", "/chains/new");
  });

  it("starts on the chains waiting for a part, each with the part it needs and a way to draw it", async () => {
    show();
    const first = (await screen.findByText("A tall cat")).closest("li")!;
    expect(within(first).getByText("Part 2 of 3")).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "Draw part 2" })).toHaveAttribute("href", "/chains/c1/draw");
    const second = screen.getByText("No idea given: surprise me").closest("li")!;
    expect(within(second).getByRole("link", { name: "Draw part 3" })).toHaveAttribute("href", "/chains/c2/draw");
    expect(screen.getByRole("button", { name: "Waiting for a part" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows finished chains as the whole drawing with who drew it", async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Finished" }));
    const card = (await screen.findByRole("link", { name: "Three friends" })).closest("li")!;
    expect(card).toContainElement(screen.getByRole("link", { name: "Three friends" }));
    expect(within(card).getAllByRole("img")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Three friends" })).toHaveAttribute("href", "/chains/d1");
    expect(within(card).getByRole("link", { name: "BEN" })).toHaveAttribute("href", "/u/ben");
  });

  it("shows your own chains, finished or still waiting", async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "My chains" }));
    const waitingCard = (await screen.findByText("Mine waiting")).closest("li")!;
    expect(within(waitingCard).getByText("Waiting for part 2 of 3")).toBeInTheDocument();
    const doneCard = screen.getByText("Mine done").closest("li")!;
    expect(within(doneCard).getByText("Finished")).toBeInTheDocument();
    expect(within(doneCard).getByRole("link", { name: "The whole drawing" })).toHaveAttribute("href", "/chains/m2");
  });

  it("says so when there is nothing in a tab", async () => {
    const user = userEvent.setup();
    api.open.mockResolvedValue({ chains: [], hasMore: false });
    api.complete.mockResolvedValue({ chains: [], hasMore: false });
    api.mine.mockResolvedValue({ chains: [] });
    show();
    expect(await screen.findByText("No chains are waiting right now. Start one!")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finished" }));
    expect(await screen.findByText("No chains are finished yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "My chains" }));
    expect(await screen.findByText("You haven't drawn on a chain yet.")).toBeInTheDocument();
  });

  it("shows more when there are more, adding to the list", async () => {
    const user = userEvent.setup();
    api.open.mockResolvedValueOnce({ chains: [waiting("c1", "First")], hasMore: true }).mockResolvedValueOnce({ chains: [waiting("c9", "Ninth")], hasMore: false });
    show();
    await screen.findByText("First");
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Ninth")).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(api.open).toHaveBeenLastCalledWith(2);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("shows a loading shape while it waits, and says what went wrong", async () => {
    let fail!: (e: Error) => void;
    api.open.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    show();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-busy", "true");
    fail(new ApiError(500, "Server fell over"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Server fell over"));
  });
});
