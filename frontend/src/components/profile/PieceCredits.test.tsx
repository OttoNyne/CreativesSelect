import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PieceCredits } from "./PieceCredits";
import { creditsApi } from "../../api/credits.api";
import { friendsApi } from "../../api/friends.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { MediaCredit, MediaItem, User } from "../../types";

vi.mock("../../api/credits.api", () => ({ creditsApi: { add: vi.fn(), accept: vi.fn(), remove: vi.fn() } }));
vi.mock("../../api/friends.api", () => ({ friendsApi: { list: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));

const api = vi.mocked(creditsApi);
const person = (username: string, name = username) => ({ id: `id-${username}`, username, displayName: name, avatarUrl: null, csVerified: false });
const credit = (username: string, role: string, status: MediaCredit["status"] = "accepted"): MediaCredit => ({ id: `c-${username}`, itemId: "m1", role, status, user: person(username, username.toUpperCase()) });
const piece = (credits: MediaCredit[] = []) => ({ id: "m1", ownerId: "owner", url: "https://x/y.jpg", type: "image", caption: null, isAiImage: false, reactions: { counts: {}, total: 0, mine: null }, credits, createdAt: "" }) as unknown as MediaItem;

function show(item: MediaItem, { isOwner = false, viewer = "someone" } = {}) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: `id-${viewer}`, username: viewer } as User, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
  const onChange = vi.fn();
  render(
    <MemoryRouter>
      <PieceCredits item={item} isOwner={isOwner} onChange={onChange} />
    </MemoryRouter>
  );
  return onChange;
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  vi.mocked(friendsApi.list).mockReset();
  vi.mocked(friendsApi.list).mockResolvedValue({ friends: [{ id: "id-bob", username: "bob", displayName: "Bob" }, { id: "id-cara", username: "cara", displayName: "Cara" }] as User[] });
});

describe("PieceCredits", () => {
  it("shows nothing to a visitor when nobody is credited", () => {
    show(piece(), { isOwner: false });
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows who worked on a piece, linked to their profiles, with what they did", () => {
    show(piece([credit("bob", "Illustrator"), credit("cara", "Producer")]));
    const list = screen.getByRole("list", { name: "Who worked on this" });
    expect(list).toHaveTextContent("BOB");
    expect(screen.getByRole("link", { name: "BOB" })).toHaveAttribute("href", "/u/bob");
    expect(screen.getByText("— Producer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Take/ })).toBeNull(); // a visitor can't change anything
  });

  describe("for the owner", () => {
    it("credits a friend who isn't already credited, with a role", async () => {
      api.add.mockResolvedValue({ credit: credit("cara", "Model", "pending") });
      const onChange = show(piece([credit("bob", "Producer")]), { isOwner: true, viewer: "owner" });
      await userEvent.click(screen.getByRole("button", { name: "+ Credit someone" }));
      const choose = await screen.findByRole("combobox", { name: "Who worked on it" });
      await waitFor(() => expect(screen.getByRole("option", { name: "Cara" })).toBeInTheDocument());
      expect(screen.queryByRole("option", { name: "Bob" })).toBeNull(); // already credited
      await userEvent.selectOptions(choose, "cara");
      expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled(); // a role is needed too
      await userEvent.type(screen.getByRole("textbox", { name: "What they did (e.g. illustrator)" }), "  Model ");
      await userEvent.click(screen.getByRole("button", { name: "Ask" }));
      expect(api.add).toHaveBeenCalledWith("m1", "cara", "Model");
      await waitFor(() => expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: "c-bob" }), expect.objectContaining({ id: "c-cara", status: "pending" })]));
    });

    it("says why a credit couldn't be made", async () => {
      api.add.mockRejectedValue(new ApiError(400, "You can only credit your friends"));
      show(piece(), { isOwner: true, viewer: "owner" });
      await userEvent.click(screen.getByRole("button", { name: "+ Credit someone" }));
      await waitFor(() => expect(screen.getByRole("option", { name: "Bob" })).toBeInTheDocument());
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Who worked on it" }), "bob");
      await userEvent.type(screen.getByRole("textbox", { name: "What they did (e.g. illustrator)" }), "Editor");
      await userEvent.click(screen.getByRole("button", { name: "Ask" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("You can only credit your friends");
    });

    it("marks a credit still waiting for the person, and takes any credit off", async () => {
      api.remove.mockResolvedValue(undefined);
      const onChange = show(piece([credit("bob", "Producer", "pending"), credit("cara", "Model")]), { isOwner: true, viewer: "owner" });
      expect(screen.getByText("waiting for them")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Take BOB's credit off this piece" }));
      expect(api.remove).toHaveBeenCalledWith("c-bob");
      await waitFor(() => expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: "c-cara" })]));
    });

    it("stops offering to credit once ten people are credited", () => {
      const ten = Array.from({ length: 10 }, (_, i) => credit(`p${i}`, "Helper"));
      show(piece(ten), { isOwner: true, viewer: "owner" });
      expect(screen.queryByRole("button", { name: "+ Credit someone" })).toBeNull();
    });
  });

  describe("for the person credited", () => {
    it("can accept or decline a credit that is waiting, and sees it as theirs", async () => {
      api.accept.mockResolvedValue({ credit: { id: "c-bob", itemId: "m1", role: "Producer", status: "accepted" } });
      const onChange = show(piece([credit("bob", "Producer", "pending")]), { viewer: "bob" });
      await userEvent.click(screen.getByRole("button", { name: "Accept" }));
      expect(api.accept).toHaveBeenCalledWith("c-bob");
      await waitFor(() => expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: "c-bob", status: "accepted" })]));
    });

    it("declining removes it", async () => {
      api.remove.mockResolvedValue(undefined);
      const onChange = show(piece([credit("bob", "Producer", "pending")]), { viewer: "bob" });
      await userEvent.click(screen.getByRole("button", { name: "Decline" }));
      expect(api.remove).toHaveBeenCalledWith("c-bob");
      await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
    });

    it("can take their own name off once it is accepted, but not someone else's", async () => {
      api.remove.mockResolvedValue(undefined);
      const onChange = show(piece([credit("bob", "Producer"), credit("cara", "Model")]), { viewer: "bob" });
      expect(screen.getAllByRole("button", { name: "Take your name off this piece" })).toHaveLength(1);
      await userEvent.click(screen.getByRole("button", { name: "Take your name off this piece" }));
      await waitFor(() => expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: "c-cara" })]));
    });
  });
});
