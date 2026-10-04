import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HostStage, ListenerStage, type ListenerStageProps } from "./StagePanel";
import { liveApi } from "../../api/live.api";
import { ApiError } from "../../api/client";
import type { LiveStage, User } from "../../types";

vi.mock("../../api/live.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/live.api")>()),
  liveApi: { inviteGuest: vi.fn(), removeGuest: vi.fn() },
}));
const api = vi.mocked(liveApi);

const person = (id: string, name: string) => ({ id, username: id, displayName: name, avatarUrl: null }) as User;
const lena = person("u1", "Lena");
const bo = person("u2", "Bo");
const cy = person("u3", "Cy");
const dee = person("u4", "Dee");

const stage = (over: Partial<LiveStage> = {}): LiveStage => ({
  enabled: true,
  maxGuests: 9,
  me: null,
  guests: [],
  requests: [],
  invited: [],
  listeners: [],
  ...over,
});

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.inviteGuest.mockResolvedValue({ stage: "invited" });
  api.removeGuest.mockResolvedValue({ stage: "listener" });
});

describe("HostStage", () => {
  it("counts the guest places used, invitations included", () => {
    render(<HostStage liveId="l1" stage={stage({ guests: [{ user: lena }], invited: [{ user: bo }] })} onChange={() => {}} />);
    expect(screen.getByText("2 of 9 guest places used")).toBeInTheDocument();
  });

  it("invites someone who asked, then refreshes", async () => {
    const onChange = vi.fn();
    render(<HostStage liveId="l1" stage={stage({ requests: [{ user: lena }] })} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Invite Lena to speak" }));
    expect(api.inviteGuest).toHaveBeenCalledWith("l1", "u1");
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("lets the host invite anyone listening, not just those who asked", async () => {
    render(<HostStage liveId="l1" stage={stage({ listeners: [{ user: bo }, { user: cy }] })} onChange={() => {}} />);
    expect(screen.getByText("Listening (2)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Invite Cy to speak" }));
    expect(api.inviteGuest).toHaveBeenCalledWith("l1", "u3");
  });

  it("dismisses a request, withdraws an invitation and removes a guest", async () => {
    render(
      <HostStage liveId="l1" stage={stage({ requests: [{ user: lena }], invited: [{ user: bo }], guests: [{ user: cy }] })} onChange={() => {}} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Dismiss Lena's request" }));
    await userEvent.click(screen.getByRole("button", { name: "Withdraw the invitation to Bo" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Cy from the stage" }));
    expect(api.removeGuest.mock.calls).toEqual([["l1", "u1"], ["l1", "u2"], ["l1", "u3"]]);
  });

  it("stops inviting when the stage is full and says how to make room", () => {
    const guests = Array.from({ length: 9 }, (_, i) => ({ user: person(`g${i}`, `Guest ${i}`) }));
    render(<HostStage liveId="l1" stage={stage({ guests, listeners: [{ user: dee }] })} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Invite Dee to speak" })).toBeDisabled();
    expect(screen.getByText(/The stage is full/)).toBeInTheDocument();
  });

  it("shows the server's reason when something is refused", async () => {
    api.inviteGuest.mockRejectedValue(new ApiError(409, "The stage is full (9 guests). Remove someone first."));
    render(<HostStage liveId="l1" stage={stage({ listeners: [{ user: dee }] })} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Invite Dee to speak" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The stage is full (9 guests)");
  });

  it("says when no one is listening yet, and reminds the host about headphones", () => {
    render(<HostStage liveId="l1" stage={stage()} onChange={() => {}} />);
    expect(screen.getByText("No one else is listening yet.")).toBeInTheDocument();
    expect(screen.getByText(/Use headphones/)).toBeInTheDocument();
  });
});

describe("ListenerStage", () => {
  const handlers = () => ({ onRequest: vi.fn(), onLeave: vi.fn(), onAccept: vi.fn(), onToggleMute: vi.fn(), onStartMic: vi.fn() });
  function renderListener(me: LiveStage["me"], over: Partial<ListenerStageProps> = {}, guests: LiveStage["guests"] = []) {
    const h = handlers();
    render(<ListenerStage stage={stage({ me, guests })} busy={false} error={null} micOn={false} micStarted={false} {...h} {...over} />);
    return h;
  }

  it("offers to ask to speak", async () => {
    const h = renderListener("listener");
    await userEvent.click(screen.getByRole("button", { name: "Ask to speak" }));
    expect(h.onRequest).toHaveBeenCalled();
  });

  it("shows a pending request, which can be cancelled", async () => {
    const h = renderListener("requested");
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for the host");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.onLeave).toHaveBeenCalled();
  });

  it("shows the invitation, which can be accepted or turned down", async () => {
    const h = renderListener("invited");
    expect(screen.getByRole("status")).toHaveTextContent("The host invited you to speak");
    await userEvent.click(screen.getByRole("button", { name: "Join the stage" }));
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(h.onAccept).toHaveBeenCalled();
    expect(h.onLeave).toHaveBeenCalled();
  });

  it("while on stage: says whether the microphone is live or muted, and lets them mute or leave", async () => {
    const h = renderListener("speaking", { micStarted: true, micOn: true });
    expect(screen.getByRole("status")).toHaveTextContent("everyone can hear you");
    await userEvent.click(screen.getByRole("button", { name: "Mute my microphone" }));
    await userEvent.click(screen.getByRole("button", { name: "Leave the stage" }));
    expect(h.onToggleMute).toHaveBeenCalled();
    expect(h.onLeave).toHaveBeenCalled();
  });

  it("shows muted", () => {
    renderListener("speaking", { micStarted: true, micOn: false });
    expect(screen.getByRole("status")).toHaveTextContent("on stage, muted");
    expect(screen.getByRole("button", { name: "Unmute my microphone" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers to turn the microphone on when they are on stage without it", async () => {
    const h = renderListener("speaking", { micStarted: false });
    expect(screen.getByRole("status")).toHaveTextContent("microphone is off");
    await userEvent.click(screen.getByRole("button", { name: "Turn on microphone" }));
    expect(h.onStartMic).toHaveBeenCalled();
  });

  it("names who is on stage, and shows an error", () => {
    renderListener("listener", { error: "Microphone access was blocked." }, [{ user: lena }, { user: bo }]);
    expect(screen.getByText("Lena, Bo")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Microphone access was blocked.");
  });

  it("disables the buttons while something is in progress", () => {
    renderListener("listener", { busy: true });
    expect(screen.getByRole("button", { name: "Ask to speak" })).toBeDisabled();
  });
});

describe("HostStage: choosing sections", () => {
  const full = stage({ guests: [{ user: lena }], invited: [{ user: bo }], requests: [{ user: cy }], listeners: [{ user: dee }] });

  it("shows only the lists asked for, with or without the heading", () => {
    const { rerender } = render(<HostStage liveId="l1" stage={full} onChange={() => {}} sections={["requests"]} heading={false} label="Asking to speak" />);
    expect(screen.getByRole("region", { name: "Asking to speak" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite Cy to speak" })).toBeInTheDocument();
    for (const gone of [/Remove Lena/, /Withdraw the invitation to Bo/, /Invite Dee/]) expect(screen.queryByRole("button", { name: gone })).not.toBeInTheDocument();
    expect(screen.queryByText(/guest places used/)).not.toBeInTheDocument();
    expect(screen.queryByText("Listening (1)")).not.toBeInTheDocument();

    rerender(<HostStage liveId="l1" stage={full} onChange={() => {}} sections={["listeners"]} heading={false} label="Listeners" />);
    expect(screen.getByRole("button", { name: "Invite Dee to speak" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite Cy to speak" })).not.toBeInTheDocument();
  });

  it("shows everything, with the heading, when not told otherwise", () => {
    render(<HostStage liveId="l1" stage={full} onChange={() => {}} />);
    expect(screen.getByRole("region", { name: "Guests on stage" })).toBeInTheDocument();
    expect(screen.getByText("2 of 9 guest places used")).toBeInTheDocument();
    for (const name of [/Remove Lena/, /Withdraw the invitation to Bo/, /Invite Cy to speak/, /Invite Dee to speak/]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });
});
