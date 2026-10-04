import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HostConsole, type HostConsoleProps } from "./HostConsole";
import { liveApi } from "../../api/live.api";
import type { LiveRoom, LiveStage, User } from "../../types";

const wide = vi.hoisted(() => ({ value: false }));
vi.mock("../../lib/useMediaQuery", () => ({ useIsWideScreen: () => wide.value }));
vi.mock("../../api/live.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/live.api")>()),
  liveApi: { removeGuest: vi.fn(), inviteGuest: vi.fn() },
}));
// The chat has its own tests; here it is a stand-in that can announce new comments.
const chat = vi.hoisted(() => ({ onFresh: undefined as undefined | ((n: number) => void) }));
vi.mock("./LiveChat", () => ({
  LiveChat: ({ onFresh }: { onFresh?: (n: number) => void }) => {
    chat.onFresh = onFresh;
    return <div>chat panel</div>;
  },
}));
const api = vi.mocked(liveApi);

const person = (id: string, name: string) => ({ id, username: id, displayName: name, avatarUrl: null }) as User;
const host = person("host", "DJ Kai");
const room = (over: Partial<LiveRoom> = {}): LiveRoom => ({ id: "l1", title: "Open mic", status: "live", startedAt: "", host, isHost: true, listenerCount: 24, maxListeners: 50, mode: "sfu", maxGuests: 9, ...over });
const stage = (over: Partial<LiveStage> = {}): LiveStage => ({
  enabled: true,
  maxGuests: 9,
  me: null,
  guests: [{ user: person("g1", "Lena") }],
  requests: [{ user: person("r1", "Cyd") }, { user: person("r2", "Dee") }],
  invited: [{ user: person("i1", "Bob") }],
  listeners: [{ user: person("l1", "Fi") }, { user: person("l2", "Gus") }],
  ...over,
});
function props(over: Partial<HostConsoleProps> = {}): HostConsoleProps {
  return {
    room: room(),
    stage: stage(),
    onStageChange: vi.fn(),
    muted: false,
    onToggleMute: vi.fn(),
    onEnd: vi.fn(),
    phoneOnline: true,
    connection: "live",
    failure: null,
    mic: "ok",
    details: [],
    speaking: [],
    ...over,
  };
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.removeGuest.mockResolvedValue({ stage: "listener" });
  api.inviteGuest.mockResolvedValue({ stage: "invited" });
  chat.onFresh = undefined;
  wide.value = false;
});

describe("HostConsole on a phone", () => {
  it("keeps the controls on top and the stage in the first tab", () => {
    render(<HostConsole {...props()} />);
    expect(screen.getByRole("button", { name: "Mute microphone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End live" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Stage/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Remove Lena from the stage" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Invite Cyd to speak" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "The stage" })).not.toBeInTheDocument(); // tiles are for wide screens
  });

  it("shows one tab at a time, each connected to its panel", async () => {
    render(<HostConsole {...props()} />);
    expect(screen.getByRole("button", { name: "Invite Fi to speak", hidden: true })).not.toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: /^Listeners/ }));
    expect(screen.getByRole("tab", { name: /^Listeners/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Invite Fi to speak" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Lena from the stage", hidden: true })).not.toBeVisible();
    const panel = document.getElementById(screen.getByRole("tab", { name: /^Listeners/ }).getAttribute("aria-controls")!)!;
    expect(panel).toHaveAttribute("role", "tabpanel");
    await userEvent.click(screen.getByRole("tab", { name: /^Chat/ }));
    expect(screen.getByText("chat panel")).toBeVisible();
  });

  it("keeps the controls in reach on every tab", async () => {
    render(<HostConsole {...props()} />);
    for (const tab of [/^Listeners/, /^Chat/, /^Stage/]) {
      await userEvent.click(screen.getByRole("tab", { name: tab }));
      expect(screen.getByRole("button", { name: "End live" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Mute microphone" })).toBeVisible();
    }
  });

  it("counts the listeners on their tab", () => {
    render(<HostConsole {...props()} />);
    expect(screen.getByRole("tab", { name: /^Listeners/ })).toHaveTextContent("(2)");
  });

  it("says on another tab when someone is asking to speak, and clears it on the stage tab", async () => {
    render(<HostConsole {...props()} />);
    expect(screen.getByRole("tab", { name: /^Stage/ })).not.toHaveTextContent("2");
    await userEvent.click(screen.getByRole("tab", { name: /^Chat/ }));
    expect(screen.getByRole("tab", { name: /^Stage/ })).toHaveTextContent("2");
    await userEvent.click(screen.getByRole("tab", { name: /^Stage/ }));
    expect(screen.getByRole("tab", { name: /^Stage/ })).not.toHaveTextContent("2");
  });

  it("counts new chat comments while another tab is open, and clears the count when the chat is opened", async () => {
    render(<HostConsole {...props()} />);
    act(() => chat.onFresh?.(3));
    expect(screen.getByRole("tab", { name: /^Chat/ })).toHaveTextContent("3");
    act(() => chat.onFresh?.(2));
    expect(screen.getByRole("tab", { name: /^Chat/ })).toHaveTextContent("5");
    await userEvent.click(screen.getByRole("tab", { name: /^Chat/ }));
    expect(screen.getByRole("tab", { name: /^Chat/ })).not.toHaveTextContent("5");
    act(() => chat.onFresh?.(4)); // already reading it
    expect(screen.getByRole("tab", { name: /^Chat/ })).not.toHaveTextContent("4");
  });

  it("does the stage's actions", async () => {
    const p = props();
    render(<HostConsole {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Invite Cyd to speak" }));
    expect(api.inviteGuest).toHaveBeenCalledWith("l1", "r1");
    await userEvent.click(screen.getByRole("button", { name: "Remove Lena from the stage" }));
    expect(api.removeGuest).toHaveBeenCalledWith("l1", "g1");
  });

  it("runs the buttons", async () => {
    const p = props();
    render(<HostConsole {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Mute microphone" }));
    await userEvent.click(screen.getByRole("button", { name: "End live" }));
    expect(p.onToggleMute).toHaveBeenCalled();
    expect(p.onEnd).toHaveBeenCalled();
  });
});

describe("HostConsole on a wide screen", () => {
  beforeEach(() => {
    wide.value = true;
  });

  it("shows the stage as tiles: you, each guest, each invitation, and an open place for every free one", () => {
    render(<HostConsole {...props()} />);
    const tiles = within(screen.getByRole("list", { name: "The stage" })).getAllByRole("listitem");
    expect(tiles[0]).toHaveAccessibleName(/^You/);
    expect(screen.getByRole("listitem", { name: /^Lena/ })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: /^Bob.*invited/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Invite someone to speak" })).toHaveLength(7);
    expect(screen.getByText("2 of 9 guest places used")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("puts who is asking, who is listening and the chat beside it", () => {
    render(<HostConsole {...props()} />);
    expect(within(screen.getByRole("region", { name: "Asking to speak" })).getByRole("button", { name: "Invite Cyd to speak" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Listeners" })).getByRole("button", { name: "Invite Fi to speak" })).toBeInTheDocument();
    expect(screen.getByText("chat panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End live" })).toBeInTheDocument();
  });

  it("removes a guest from their tile", async () => {
    const p = props();
    render(<HostConsole {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Lena from the stage" }));
    expect(api.removeGuest).toHaveBeenCalledWith("l1", "g1");
    expect(p.onStageChange).toHaveBeenCalled();
  });

  it("shows the server's reason when a removal is refused", async () => {
    api.removeGuest.mockRejectedValue(new Error("boom"));
    render(<HostConsole {...props()} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Lena from the stage" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't work");
  });

  it("takes the host to the listeners when an open place is chosen", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    render(<HostConsole {...props()} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Invite someone to speak" })[0]);
    expect(scrolled).toHaveBeenCalled();
  });

  it("marks who is speaking, and shows you muted when you are", () => {
    const { rerender } = render(<HostConsole {...props({ speaking: ["host", "g1"] })} />);
    expect(screen.getByRole("listitem", { name: /^You, speaking/ })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: /^Lena, speaking/ })).toBeInTheDocument();
    rerender(<HostConsole {...props({ speaking: ["host"], muted: true })} />);
    expect(screen.getByRole("listitem", { name: /^You, muted/ })).toBeInTheDocument(); // not "speaking" while muted
  });

  it("has no open places left on a full stage, and tells you", () => {
    const guests = Array.from({ length: 9 }, (_, i) => ({ user: person(`g${i}`, `Guest ${i}`) }));
    render(<HostConsole {...props({ stage: stage({ guests, invited: [], requests: [] }) })} />);
    expect(screen.queryByRole("button", { name: "Invite someone to speak" })).not.toBeInTheDocument();
    expect(screen.getByText("9 of 9 guest places used")).toBeInTheDocument();
  });

  it("leaves out the asking card when nobody is asking or waiting", () => {
    render(<HostConsole {...props({ stage: stage({ requests: [], invited: [] }) })} />);
    expect(screen.queryByRole("region", { name: "Asking to speak" })).not.toBeInTheDocument();
  });
});

describe("HostConsole notices (any size)", () => {
  it("shows the connection and microphone messages beside the controls", () => {
    const { rerender } = render(<HostConsole {...props({ connection: "reconnecting" })} />);
    expect(screen.getByText(/Your connection dropped — reconnecting/)).toBeInTheDocument();
    rerender(<HostConsole {...props({ phoneOnline: false })} />);
    expect(screen.getByText(/Your phone has lost its internet connection/)).toBeInTheDocument();
    rerender(<HostConsole {...props({ mic: "paused" })} />);
    expect(screen.getByText(/paused the microphone/)).toBeInTheDocument();
    rerender(<HostConsole {...props({ mic: "ended" })} />);
    expect(screen.getByText(/stopped the microphone/)).toBeInTheDocument();
  });

  it("gives a failure its full stop, and hides the softer messages", () => {
    render(<HostConsole {...props({ failure: "The connection to the live audio service was lost", connection: "reconnecting", mic: "paused" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("lost. Listeners can't hear you");
    expect(screen.queryByText(/Your connection dropped/)).not.toBeInTheDocument();
    expect(screen.queryByText(/paused the microphone/)).not.toBeInTheDocument();
  });

  it("opens the connection details when something is wrong, and says it is muted", () => {
    const { container } = render(<HostConsole {...props({ connection: "reconnecting", muted: true })} />);
    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Unmute microphone" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("HostConsole without a stage", () => {
  it("is the simple screen, on a phone or a wide screen: controls, then the chat", () => {
    for (const isWide of [false, true]) {
      wide.value = isWide;
      const { unmount } = render(<HostConsole {...props({ stage: null, room: room({ mode: "mesh", maxGuests: 0 }) })} />);
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "The stage" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "End live" })).toBeInTheDocument();
      expect(screen.getByText("chat panel")).toBeInTheDocument();
      unmount();
    }
  });
});
