import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Collaborations, CreditRequests } from "./CreditLists";
import { creditsApi } from "../../api/credits.api";
import { ApiError } from "../../api/client";
import type { CreditedPiece, MediaItem } from "../../types";

vi.mock("../../api/credits.api", () => ({ creditsApi: { mine: vi.fn(), accept: vi.fn(), remove: vi.fn(), forUser: vi.fn() } }));
const api = vi.mocked(creditsApi);

const entry = (id: string, role: string, over: Partial<MediaItem> = {}): CreditedPiece => ({
  id,
  role,
  item: { id: `m-${id}`, ownerId: "o", url: "https://x/y.jpg", type: "image", caption: "Harbour sketch", isAiImage: false, reactions: { counts: {}, total: 0, mine: null }, createdAt: "", ...over } as MediaItem,
  owner: { id: "o", username: "alice", displayName: "Alice", avatarUrl: null, csVerified: false },
  createdAt: "",
});

beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

describe("CreditRequests", () => {
  it("shows nothing when nobody has asked", async () => {
    api.mine.mockResolvedValue({ requests: [] });
    render(<CreditRequests onAccepted={() => {}} />);
    await waitFor(() => expect(api.mine).toHaveBeenCalled());
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("lists who asked, for which piece and as what, and accepting tells the page", async () => {
    api.mine.mockResolvedValue({ requests: [entry("c1", "Producer"), entry("c2", "Editor")] });
    api.accept.mockResolvedValue({ credit: { id: "c1", itemId: "m-c1", role: "Producer", status: "accepted" } });
    const onAccepted = vi.fn();
    render(<CreditRequests onAccepted={onAccepted} />);
    const region = await screen.findByRole("region", { name: "Credits waiting for you" });
    expect(region).toHaveTextContent("Alice credited you as Producer");
    expect(region).toHaveTextContent("Harbour sketch");
    await userEvent.click(screen.getAllByRole("button", { name: "Accept" })[0]);
    expect(api.accept).toHaveBeenCalledWith("c1");
    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
    expect(screen.queryByText(/as Producer/)).toBeNull(); // answered ones leave the list
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("declining removes it without telling the page there is something new", async () => {
    api.mine.mockResolvedValue({ requests: [entry("c1", "Producer")] });
    api.remove.mockResolvedValue(undefined);
    const onAccepted = vi.fn();
    render(<CreditRequests onAccepted={onAccepted} />);
    await userEvent.click(await screen.findByRole("button", { name: "Decline" }));
    expect(api.remove).toHaveBeenCalledWith("c1");
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("says why an answer couldn't be saved, and keeps the request", async () => {
    api.mine.mockResolvedValue({ requests: [entry("c1", "Producer")] });
    api.accept.mockRejectedValue(new ApiError(404, "Credit not found"));
    render(<CreditRequests onAccepted={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Credit not found");
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });
});

describe("Collaborations", () => {
  it("shows nothing when there are none, or when they can't be read", async () => {
    api.forUser.mockResolvedValue({ collaborations: [] });
    const first = render(<MemoryRouter><Collaborations username="bob" /></MemoryRouter>);
    await waitFor(() => expect(api.forUser).toHaveBeenCalledWith("bob"));
    expect(screen.queryByRole("region")).toBeNull();
    first.unmount();
    api.forUser.mockRejectedValue(new ApiError(404, "Profile not available"));
    render(<MemoryRouter><Collaborations username="bob" /></MemoryRouter>);
    await waitFor(() => expect(api.forUser).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("shows each piece with the role and its owner, linked to the piece on the owner's profile", async () => {
    api.forUser.mockResolvedValue({ collaborations: [entry("c1", "Producer")] });
    render(<MemoryRouter><Collaborations username="bob" /></MemoryRouter>);
    const link = await screen.findByRole("link", { name: /Producer/ });
    expect(link).toHaveAttribute("href", "/u/alice?piece=m-c1#portfolio");
    expect(link).toHaveTextContent("by Alice");
    expect(screen.getByRole("region", { name: "Collaborations" })).toBeInTheDocument();
  });

  it("reads the list again when told something changed", async () => {
    api.forUser.mockResolvedValue({ collaborations: [] });
    const view = render(<MemoryRouter><Collaborations username="bob" refreshKey={0} /></MemoryRouter>);
    await waitFor(() => expect(api.forUser).toHaveBeenCalledTimes(1));
    view.rerender(<MemoryRouter><Collaborations username="bob" refreshKey={1} /></MemoryRouter>);
    await waitFor(() => expect(api.forUser).toHaveBeenCalledTimes(2));
  });
});
