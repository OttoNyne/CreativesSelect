import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { InviteFriends } from "./InviteFriends";
import { invitesApi } from "../../api/invites.api";
import { ApiError } from "../../api/client";
import type { Invite, User } from "../../types";

vi.mock("../../api/invites.api", () => ({ invitesApi: { list: vi.fn(), create: vi.fn(), revoke: vi.fn(), preview: vi.fn() } }));
vi.mock("../share/ShareButton", () => ({ ShareButton: ({ url, children }: { url: string; children: React.ReactNode }) => <button data-url={url}>{children}</button> }));
const api = vi.mocked(invitesApi);

const bob = { id: "u2", username: "bobby", displayName: "Bobby", avatarUrl: null } as User;
const invite = (over: Partial<Invite> = {}): Invite => ({
  id: "i1",
  code: "AbCdEf123456_-xy",
  uses: 0,
  maxUses: 10,
  expiresAt: "2026-10-11T12:00:00.000Z",
  createdAt: "2026-10-04T12:00:00.000Z",
  joined: [],
  ...over,
});

const renderIt = () =>
  render(
    <MemoryRouter>
      <InviteFriends />
    </MemoryRouter>
  );

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  vi.restoreAllMocks();
  api.list.mockResolvedValue({ invites: [] });
});

describe("InviteFriends", () => {
  it("explains the link and its limits, and offers to make one", async () => {
    renderIt();
    expect(await screen.findByRole("button", { name: "Create invite link" })).toBeInTheDocument();
    expect(screen.getByText(/becomes your friend straight away/)).toBeInTheDocument();
    expect(screen.getByText(/7 days and up to 10 people/)).toBeInTheDocument();
  });

  it("makes a link, shows it to copy, and offers the share window", async () => {
    api.create.mockResolvedValue({ invite: invite() });
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Create invite link" }));
    const box = (await screen.findByLabelText("Invite link")) as HTMLInputElement;
    expect(box.value).toMatch(/\/join\/AbCdEf123456_-xy$/);
    expect(box).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Share or show QR code" })).toHaveAttribute("data-url", box.value);
    expect(screen.getByText(/0 of 10 used · expires October 11, 2026/)).toBeInTheDocument();
  });

  it("lists links already made, with who joined through each", async () => {
    api.list.mockResolvedValue({ invites: [invite({ uses: 1, joined: [{ user: bob, at: "2026-10-05T12:00:00.000Z" }] })] });
    renderIt();
    expect(await screen.findByText(/1 of 10 used/)).toBeInTheDocument();
    const joined = screen.getByRole("list", { name: "Joined with this link" });
    expect(joined).toHaveTextContent("Bobby");
    expect(joined).toHaveTextContent("joined October 5, 2026");
    expect(screen.getByRole("link", { name: "Bobby" })).toHaveAttribute("href", "/u/bobby");
  });

  it("stops offering new links at three", async () => {
    api.list.mockResolvedValue({ invites: [invite({ id: "a" }), invite({ id: "b", code: "bbbbbbbbbbbbbbbb" }), invite({ id: "c", code: "cccccccccccccccc" })] });
    renderIt();
    await screen.findAllByLabelText("Invite link");
    expect(screen.queryByRole("button", { name: "Create invite link" })).not.toBeInTheDocument();
  });

  it("switches a link off, after asking, and says what stays the same", async () => {
    api.list.mockResolvedValue({ invites: [invite()] });
    api.revoke.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Switch off" }));
    expect(api.revoke).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Switch off" }));
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining("stay your friends"));
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith("i1"));
    await waitFor(() => expect(screen.queryByLabelText("Invite link")).not.toBeInTheDocument());
  });

  it("shows the server's reason when a link can't be made or switched off", async () => {
    api.create.mockRejectedValue(new ApiError(429, "You've made a lot of invite links today — try again tomorrow."));
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Create invite link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("try again tomorrow");
  });

  it("keeps the link when it can't be switched off", async () => {
    api.list.mockResolvedValue({ invites: [invite()] });
    api.revoke.mockRejectedValue(new ApiError(500, "boom"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Switch off" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    expect(screen.getByLabelText("Invite link")).toBeInTheDocument();
  });

  it("says so, and still offers a new link, when the list can't be loaded", async () => {
    api.list.mockRejectedValue(new ApiError(500, "boom"));
    renderIt();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your invite links");
  });
});
