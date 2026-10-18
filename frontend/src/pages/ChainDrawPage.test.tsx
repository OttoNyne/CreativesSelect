import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ChainDrawPage } from "./ChainDrawPage";
import { chainsApi, type Chain, type WaitingChain } from "../api/chains.api";
import { ApiError } from "../api/client";
import { API_BASE } from "../api/base";
import { edgePicture, partPicture } from "../lib/chainPictures";
import { sparkOfDay, sparkText } from "../lib/sparks";

vi.mock("../api/chains.api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api/chains.api")>()), chainsApi: { claim: vi.fn(), release: vi.fn(), start: vi.fn(), addPart: vi.fn() } }));
vi.mock("../lib/chainPictures", () => ({ partPicture: vi.fn(), edgePicture: vi.fn() }));
// the drawing surface has its own tests: here it is a button that "draws" and shows what the page puts above it
vi.mock("../components/play/Sketchpad", () => ({
  Sketchpad: ({ canvasRef, onStrokes, above, width, height, draftKey }: { canvasRef: React.RefObject<HTMLCanvasElement | null>; onStrokes: (n: number) => void; above?: React.ReactNode; width?: number; height?: number; draftKey?: string }) => (
    <div data-testid="pad" data-size={`${width}x${height}`} data-key={draftKey}>
      {above}
      <canvas ref={canvasRef} />
      <button type="button" onClick={() => onStrokes(1)}>
        draw
      </button>
    </div>
  ),
}));

const api = vi.mocked(chainsApi);
const png = new Blob(["png"], { type: "image/png" });
const waiting = (nextPart = 2): WaitingChain => ({ id: "c1", prompt: "A tall cat", count: nextPart - 1, parts: 3, nextPart, edgeUrl: "/api/chains/c1/edge", claimedByMe: true });
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const finished: Chain = { id: "c1", prompt: "A tall cat", status: "complete", complete: true, count: 3, parts: 3, completedAt: "x", mine: true, sections: [] };

function show(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/chains/new" element={<ChainDrawPage />} />
        <Route path="/chains/:id/draw" element={<ChainDrawPage />} />
        <Route path="/chains/:id" element={<p>the finished chain</p>} />
        <Route path="/chains" element={<p>the board</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  [api.claim, api.release, api.start, api.addPart, vi.mocked(partPicture), vi.mocked(edgePicture)].forEach((fn) => fn.mockReset());
  api.claim.mockResolvedValue({ chain: waiting(), claimedUntil: minutesFromNow(30), minutes: 30 });
  api.release.mockResolvedValue(undefined);
  vi.mocked(partPicture).mockResolvedValue(png);
  vi.mocked(edgePicture).mockResolvedValue(png);
});

describe("ChainDrawPage: starting a chain", () => {
  it("draws the first part on a page of the chain's size, with an idea, and sends both pictures", async () => {
    const user = userEvent.setup();
    api.start.mockResolvedValue({ chain: waiting() });
    show("/chains/new");
    expect(screen.getByRole("heading", { name: "Start a chain" })).toBeInTheDocument();
    expect(screen.getByTestId("pad")).toHaveAttribute("data-size", "1200x400");
    expect(api.claim).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send the first part" })).toBeDisabled();
    await user.type(screen.getByLabelText("Idea (optional)"), "  A very tall cat ");
    await user.click(screen.getByRole("button", { name: "draw" }));
    await user.click(screen.getByRole("button", { name: "Send the first part" }));
    await waitFor(() => expect(api.start).toHaveBeenCalledWith(png, png, "A very tall cat"));
    expect(await screen.findByText("Sent! Your part is on its way to the next person.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All chains" })).toHaveAttribute("href", "/chains");
  });

  it("can start the idea from today's spark, kept to 100 characters", async () => {
    const user = userEvent.setup();
    show("/chains/new");
    await user.click(screen.getByRole("button", { name: "Use today's spark" }));
    expect(screen.getByLabelText("Idea (optional)")).toHaveValue(sparkText(sparkOfDay()).slice(0, 100));
    expect(screen.getByLabelText("Idea (optional)")).toHaveAttribute("maxlength", "100");
  });

  it("says why it couldn't be sent, and keeps the page", async () => {
    const user = userEvent.setup();
    api.start.mockRejectedValueOnce(new ApiError(403, "Chains are shown to everyone, so only public profiles can take part. Make your profile public to join one.")).mockRejectedValueOnce(new Error("offline"));
    show("/chains/new");
    await user.click(screen.getByRole("button", { name: "draw" }));
    await user.click(screen.getByRole("button", { name: "Send the first part" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("only public profiles can take part");
    await user.click(screen.getByRole("button", { name: "Send the first part" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't send your drawing, try again."));
    expect(screen.getByRole("button", { name: "Send the first part" })).toBeEnabled();
  });
});

describe("ChainDrawPage: drawing the next part", () => {
  it("takes the part as it opens, and shows the edge of the part before above the page, with how long there is", async () => {
    show("/chains/c1/draw");
    expect(await screen.findByRole("heading", { name: "Draw part 2 of 3" })).toBeInTheDocument();
    expect(api.claim).toHaveBeenCalledWith("c1");
    expect(screen.getByRole("img", { name: "The bottom edge of the part before" })).toHaveAttribute("src", `${API_BASE}/api/chains/c1/edge`);
    expect(screen.getByText("The bottom of the part before. Carry on from here.")).toBeInTheDocument();
    expect(screen.getByText("A tall cat")).toBeInTheDocument();
    expect(screen.getByText(/You have (29|30) minutes to draw this part\./)).toBeInTheDocument();
    expect(screen.getByTestId("pad")).toHaveAttribute("data-key", "cs-chain-draft-c1");
  });

  it("sends the part and its edge, and then waits for the next part", async () => {
    const user = userEvent.setup();
    api.addPart.mockResolvedValue({ chain: { ...finished, status: "open", complete: false, count: 2 } });
    show("/chains/c1/draw");
    await user.click(await screen.findByRole("button", { name: "draw" }));
    await user.click(screen.getByRole("button", { name: "Send part 2" }));
    await waitFor(() => expect(api.addPart).toHaveBeenCalledWith("c1", png, png));
    expect(await screen.findByText("Your part is in. The chain is now waiting for part 3.")).toBeInTheDocument();
    // a part that was sent is not given back
    expect(api.release).not.toHaveBeenCalled();
  });

  it("sends the last part without an edge, says it is the last, and goes to the whole drawing", async () => {
    const user = userEvent.setup();
    api.claim.mockResolvedValue({ chain: waiting(3), claimedUntil: minutesFromNow(30), minutes: 30 });
    api.addPart.mockResolvedValue({ chain: finished });
    show("/chains/c1/draw");
    expect(await screen.findByText("This is the last part. Once you send it, the whole drawing is shown.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "draw" }));
    await user.click(screen.getByRole("button", { name: "Send part 3" }));
    await waitFor(() => expect(api.addPart).toHaveBeenCalledWith("c1", png, null));
    expect(edgePicture).not.toHaveBeenCalled();
    expect(await screen.findByText("the finished chain")).toBeInTheDocument();
  });

  it("gives the part back if the person leaves without sending it", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <MemoryRouter initialEntries={["/chains/c1/draw"]}>
        <Routes>
          <Route path="/chains/:id/draw" element={<ChainDrawPage />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByRole("heading", { name: "Draw part 2 of 3" });
    expect(user).toBeTruthy();
    unmount();
    expect(api.release).toHaveBeenCalledWith("c1");
  });

  it("says why when the part can't be taken, with a way back", async () => {
    api.claim.mockRejectedValue(new ApiError(409, "Someone else is drawing the next part right now — try another chain, or come back in a little while."));
    show("/chains/c1/draw");
    expect(await screen.findByRole("alert")).toHaveTextContent("Someone else is drawing the next part");
    expect(screen.getByRole("link", { name: "All chains" })).toHaveAttribute("href", "/chains");
    expect(screen.queryByTestId("pad")).toBeNull();
  });

  it("says when the time has run out, will not send, and takes the part again", async () => {
    const user = userEvent.setup();
    api.claim.mockResolvedValueOnce({ chain: waiting(), claimedUntil: new Date(Date.now() - 1000).toISOString(), minutes: 30 });
    api.claim.mockResolvedValueOnce({ chain: waiting(), claimedUntil: minutesFromNow(30), minutes: 30 });
    show("/chains/c1/draw");
    expect(await screen.findByText(/Your time for this part has run out\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "draw" }));
    expect(screen.getByRole("button", { name: "Send part 2" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Take the part again" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send part 2" })).toBeEnabled());
    expect(screen.getByText(/You have (29|30) minutes/)).toBeInTheDocument();
  });

  it("says why when the part can't be sent", async () => {
    const user = userEvent.setup();
    api.addPart.mockRejectedValue(new ApiError(409, "Take this part first — the time you had to draw it has run out, or someone else has it."));
    show("/chains/c1/draw");
    await user.click(await screen.findByRole("button", { name: "draw" }));
    await user.click(screen.getByRole("button", { name: "Send part 2" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Take this part first");
  });
});
