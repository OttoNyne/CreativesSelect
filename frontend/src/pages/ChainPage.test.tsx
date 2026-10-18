import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ChainPage } from "./ChainPage";
import { chainsApi, type Chain } from "../api/chains.api";
import { uploadFile } from "../api/media.api";
import { moderationApi } from "../api/moderation.api";
import { ApiError } from "../api/client";
import { API_BASE } from "../api/base";
import { joinParts } from "../lib/chainPictures";

vi.mock("../api/chains.api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/chains.api")>()), chainsApi: { get: vi.fn(), remove: vi.fn() } }));
vi.mock("../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../api/moderation.api", () => ({ moderationApi: { report: vi.fn() } }));
vi.mock("../lib/chainPictures", () => ({ joinParts: vi.fn() }));

const api = vi.mocked(chainsApi);
const artist = (name: string) => ({ id: name, username: name, displayName: name.toUpperCase(), avatarUrl: null, csVerified: false });
const done: Chain = {
  id: "c1",
  prompt: "Three friends",
  status: "complete",
  complete: true,
  count: 3,
  parts: 3,
  completedAt: "x",
  mine: true,
  sections: ["ann", "ben", "cat"].map((n, i) => ({ id: `s${i}`, index: i, author: artist(n), imageUrl: `/api/chains/c1/sections/${i}/image` })),
};
const waitingChain: Chain = { ...done, status: "open", complete: false, count: 2, sections: [], canDelete: true };

function show(path = "/chains/c1") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/chains/:id" element={<ChainPage />} />
        <Route path="/chains" element={<p>the board</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  [api.get, api.remove, vi.mocked(uploadFile), vi.mocked(moderationApi.report), vi.mocked(joinParts)].forEach((fn) => fn.mockReset());
  api.get.mockResolvedValue({ chain: done });
});

describe("ChainPage: a finished chain", () => {
  it("shows the whole drawing, its idea and who drew each part", async () => {
    show();
    expect(await screen.findByRole("heading", { name: "Three friends" })).toBeInTheDocument();
    expect(screen.getAllByRole("img").map((i) => i.getAttribute("alt"))).toEqual(["Part 1, drawn by ANN", "Part 2, drawn by BEN", "Part 3, drawn by CAT"]);
    expect(screen.getByRole("link", { name: "CAT" })).toHaveAttribute("href", "/u/cat");
  });

  it("lets any part be reported, naming which", async () => {
    const user = userEvent.setup();
    vi.mocked(moderationApi.report).mockResolvedValue({} as never);
    show();
    await user.click(await screen.findByRole("button", { name: "Report part 2" }));
    await user.type(screen.getByRole("textbox"), "Not suitable");
    await user.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(moderationApi.report).toHaveBeenCalledWith("chainSection", "s1", "Not suitable"));
  });

  it("lets someone who drew on it save the whole drawing to their portfolio, with the artists in the caption", async () => {
    const user = userEvent.setup();
    vi.mocked(joinParts).mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    vi.mocked(uploadFile).mockResolvedValue({ url: "u" });
    show();
    await user.click(await screen.findByRole("button", { name: "Save to my portfolio" }));
    expect(await screen.findByText("Saved to your portfolio.")).toBeInTheDocument();
    expect(joinParts).toHaveBeenCalledWith([0, 1, 2].map((i) => `${API_BASE}/api/chains/c1/sections/${i}/image`));
    const [file, purpose, caption] = vi.mocked(uploadFile).mock.calls[0];
    expect((file as File).type).toBe("image/png");
    expect(purpose).toBe("portfolio");
    expect(caption).toBe("Drawn with ANN, BEN, CAT #exquisitecorpse");
  });

  it("says why when it can't be saved", async () => {
    const user = userEvent.setup();
    vi.mocked(joinParts).mockRejectedValue(new Error("nope"));
    show();
    await user.click(await screen.findByRole("button", { name: "Save to my portfolio" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save it, try again.");
    vi.mocked(joinParts).mockResolvedValue(new Blob(["x"]));
    vi.mocked(uploadFile).mockRejectedValue(new ApiError(400, "Your portfolio is full (200 pieces) — remove one to add another"));
    await user.click(screen.getByRole("button", { name: "Save to my portfolio" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Your portfolio is full"));
  });

  it("does not offer saving to someone who didn't draw on it", async () => {
    api.get.mockResolvedValue({ chain: { ...done, mine: false } });
    show();
    await screen.findByRole("heading", { name: "Three friends" });
    expect(screen.queryByRole("button", { name: "Save to my portfolio" })).toBeNull();
  });
});

describe("ChainPage: a chain still being drawn", () => {
  it("shows no picture, only how far along it is, and lets its starter take it back after a second press", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ chain: waitingChain });
    api.remove.mockResolvedValue(undefined);
    show();
    expect(await screen.findByText("Waiting for part 3 of 3")).toBeInTheDocument();
    expect(screen.getByText(/Nobody can see it until the last part is in/)).toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Take this chain back" }));
    expect(api.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Really take it back?" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("c1"));
    expect(await screen.findByText("the board")).toBeInTheDocument();
  });

  it("offers no way to take it back to anyone else", async () => {
    api.get.mockResolvedValue({ chain: { ...waitingChain, canDelete: false } });
    show();
    await screen.findByText("Waiting for part 3 of 3");
    expect(screen.queryByRole("button", { name: "Take this chain back" })).toBeNull();
  });
});

describe("ChainPage: when it can't be shown", () => {
  it("says a missing chain isn't there, with a way back", async () => {
    api.get.mockRejectedValue(new ApiError(404, "Chain not found"));
    show();
    expect(await screen.findByText("That chain isn't here any more.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All chains" })).toHaveAttribute("href", "/chains");
  });

  it("says what went wrong otherwise", async () => {
    api.get.mockRejectedValue(new ApiError(500, "Broken"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Broken");
  });
});
