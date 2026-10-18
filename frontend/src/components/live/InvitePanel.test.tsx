import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvitePanel } from "./InvitePanel";
import { liveApi, type LiveInvitee } from "../../api/live.api";
import { friendsApi } from "../../api/friends.api";
import { ApiError } from "../../api/client";
import type { User } from "../../types";

vi.mock("../../api/live.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/live.api")>()),
  liveApi: { invites: vi.fn(), invite: vi.fn(), uninvite: vi.fn() },
}));
vi.mock("../../api/friends.api", () => ({ friendsApi: { list: vi.fn() } }));
const api = vi.mocked(liveApi);
const friends = vi.mocked(friendsApi);

const person = (id: string, name: string) => ({ id, username: id, displayName: name, avatarUrl: null }) as User;
const invitee = (id: string, name: string, present = false): LiveInvitee => ({ user: person(id, name), present });

beforeEach(() => {
  [api.invites, api.invite, api.uninvite, friends.list].forEach((fn) => fn.mockReset());
  api.invites.mockResolvedValue({ invited: [invitee("a", "Ann", true), invitee("b", "Ben")], max: 100 });
  friends.list.mockResolvedValue({ friends: [person("a", "Ann"), person("b", "Ben"), person("c", "Cat")] });
});

describe("InvitePanel", () => {
  it("shows who is invited and who is in the room, and the friends who could still be invited", async () => {
    render(<InvitePanel liveId="l1" />);
    const section = await screen.findByRole("region", { name: "Invited people" });
    expect(await within(section).findByText("Ann")).toBeInTheDocument();
    expect(within(section).getByText("In the room")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Take back the invitation to Ben" })).toBeInTheDocument();
    // only the friend who isn't invited yet is offered
    await waitFor(() => expect(within(section).getByRole("button", { name: "Invite Cat" })).toBeInTheDocument());
    expect(within(section).queryByRole("button", { name: "Invite Ann" })).toBeNull();
  });

  it("invites a friend, and then shows them as invited", async () => {
    const user = userEvent.setup();
    api.invite.mockResolvedValue({ invited: [], max: 100 });
    render(<InvitePanel liveId="l1" />);
    api.invites.mockResolvedValue({ invited: [invitee("a", "Ann"), invitee("b", "Ben"), invitee("c", "Cat")], max: 100 });
    await user.click(await screen.findByRole("button", { name: "Invite Cat" }));
    expect(api.invite).toHaveBeenCalledWith("l1", ["c"]);
    expect(await screen.findByText("All your friends are invited.")).toBeInTheDocument();
  });

  it("takes an invitation back", async () => {
    const user = userEvent.setup();
    api.uninvite.mockResolvedValue(undefined);
    render(<InvitePanel liveId="l1" />);
    api.invites.mockResolvedValue({ invited: [invitee("a", "Ann")], max: 100 });
    await user.click(await screen.findByRole("button", { name: "Take back the invitation to Ben" }));
    expect(api.uninvite).toHaveBeenCalledWith("l1", "b");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Take back the invitation to Ben" })).toBeNull());
  });

  it("says when nobody is invited, and when the list is full", async () => {
    api.invites.mockResolvedValue({ invited: [], max: 100 });
    const first = render(<InvitePanel liveId="l1" />);
    expect(await screen.findByText("Nobody is invited yet.")).toBeInTheDocument();
    first.unmount();
    api.invites.mockResolvedValue({ invited: [invitee("a", "Ann")], max: 1 });
    render(<InvitePanel liveId="l1" />);
    expect(await screen.findByText("You can invite up to 1 people.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Invite / })).toBeNull();
  });

  it("says why when an invitation can't be sent", async () => {
    const user = userEvent.setup();
    api.invite.mockRejectedValue(new ApiError(400, "You can only invite your friends"));
    render(<InvitePanel liveId="l1" />);
    await user.click(await screen.findByRole("button", { name: "Invite Cat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can only invite your friends");
  });
});
