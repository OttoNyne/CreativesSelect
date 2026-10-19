import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpotlightsPanel } from "./SpotlightsPanel";
import { spotlightAdminApi, type AdminSlot } from "../../api/spotlights.api";
import { mediaApi } from "../../api/media.api";
import { ApiError } from "../../api/client";
import type { MediaItem } from "../../types";

vi.mock("../../api/spotlights.api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../api/spotlights.api")>()), spotlightAdminApi: { slots: vi.fn(), set: vi.fn(), clear: vi.fn() } }));
vi.mock("../../api/media.api", () => ({ mediaApi: { byUser: vi.fn() } }));
const api = vi.mocked(spotlightAdminApi);
const media = vi.mocked(mediaApi);

const person = (name: string) => ({ id: name, username: name.toLowerCase(), displayName: name, avatarUrl: null, headline: "", csVerified: false, tags: [] });
const filled = (slot: 1 | 2, name: string, over: Partial<Extract<AdminSlot, { empty: false }>> = {}): AdminSlot => ({ slot, empty: false, note: "", chosenPiece: null, hidden: null, user: person(name), piece: null, since: "2026-10-19T10:00:00Z", ...over });
const picture = (id: string, caption: string) => ({ id, ownerId: "u", url: `https://img.example.com/${id}.png`, type: "image", caption }) as unknown as MediaItem;

beforeEach(() => {
  [api.slots, api.set, api.clear, media.byUser].forEach((fn) => fn.mockReset());
  api.slots.mockResolvedValue({ slots: [{ slot: 1, empty: true }, { slot: 2, empty: true }], maxNote: 140 });
});

const slotOf = async (n: number) => within(await screen.findByRole("region", { name: `Slot ${n}` }));

describe("SpotlightsPanel", () => {
  it("shows both slots, empty at first, with what each is for", async () => {
    render(<SpotlightsPanel />);
    expect((await slotOf(1)).getByText("Nobody yet: this slot is empty.")).toBeInTheDocument();
    expect((await slotOf(2)).getByText("Nobody yet: this slot is empty.")).toBeInTheDocument();
    expect(screen.getByText(/Two people shown on the main screen/)).toBeInTheDocument();
    expect((await slotOf(1)).queryByRole("button", { name: "Empty this slot" })).toBeNull();
  });

  it("puts a person in a slot with a line about them, and says it is saved", async () => {
    const user = userEvent.setup();
    api.set.mockResolvedValue({ slots: [filled(1, "Ann", { note: "Murals" }), { slot: 2, empty: true }], maxNote: 140 });
    render(<SpotlightsPanel />);
    const slot = await slotOf(1);
    await user.type(slot.getByLabelText("Username"), "@ann");
    await user.type(slot.getByLabelText(/A line about them/), "Murals");
    await user.click(slot.getByRole("button", { name: "Show in slot 1" }));
    await waitFor(() => expect(api.set).toHaveBeenCalledWith(1, { username: "@ann", note: "Murals" }));
    expect(await (await slotOf(1)).findByText("Saved. The main screen shows this within a minute.")).toBeInTheDocument();
    expect((await slotOf(1)).getByText("Ann")).toBeInTheDocument();
  });

  it("finds a person's pictures and lets the administrator pick one, or leave it automatic", async () => {
    const user = userEvent.setup();
    media.byUser.mockResolvedValue({ media: [picture("m1", "A mural"), picture("m2", "A vase"), { ...picture("m3", "A song"), type: "audio" } as MediaItem] });
    api.set.mockResolvedValue({ slots: [filled(2, "Ann", { chosenPiece: "m2" }), { slot: 1, empty: true }], maxNote: 140 });
    render(<SpotlightsPanel />);
    const slot = await slotOf(2);
    await user.type(slot.getByLabelText("Username"), "ann");
    await user.click(slot.getByRole("button", { name: "Find their pictures" }));
    expect(media.byUser).toHaveBeenCalledWith("ann");
    // only pictures are offered, and the automatic choice is on until one is picked
    expect(slot.getByRole("radio", { name: /Automatic/ })).toBeChecked();
    expect(slot.getAllByRole("radio")).toHaveLength(3);
    await user.click(slot.getByRole("radio", { name: "A vase" }));
    await user.click(slot.getByRole("button", { name: "Show in slot 2" }));
    await waitFor(() => expect(api.set).toHaveBeenCalledWith(2, { username: "ann", pieceId: "m2" }));
  });

  it("says when they have no pictures, and when the person can't be found", async () => {
    const user = userEvent.setup();
    media.byUser.mockResolvedValueOnce({ media: [] }).mockRejectedValueOnce(new ApiError(404, "No one has that username"));
    render(<SpotlightsPanel />);
    const slot = await slotOf(1);
    await user.type(slot.getByLabelText("Username"), "ann");
    await user.click(slot.getByRole("button", { name: "Find their pictures" }));
    expect(await slot.findByText("They have no pictures yet, so their photo is shown.")).toBeInTheDocument();
    await user.clear(slot.getByLabelText("Username"));
    await user.type(slot.getByLabelText("Username"), "nobody");
    await user.click(slot.getByRole("button", { name: "Find their pictures" }));
    expect(await slot.findByRole("alert")).toHaveTextContent("No one has that username");
  });

  it("shows who is in a slot, warns when they can't be shown right now, and empties the slot", async () => {
    const user = userEvent.setup();
    api.slots.mockResolvedValue({ slots: [filled(1, "Ann", { note: "Murals", hidden: "private" }), filled(2, "Ben", { hidden: "suspended" })], maxNote: 140 });
    api.clear.mockResolvedValue(undefined);
    render(<SpotlightsPanel />);
    const one = await slotOf(1);
    expect(one.getByText("Ann")).toBeInTheDocument();
    expect(one.getByText("Murals")).toBeInTheDocument();
    expect(one.getByText("Not shown right now: this profile is private.")).toBeInTheDocument();
    expect((await slotOf(2)).getByText("Not shown right now: this account is suspended.")).toBeInTheDocument();
    api.slots.mockResolvedValue({ slots: [{ slot: 1, empty: true }, filled(2, "Ben", { hidden: "suspended" })], maxNote: 140 });
    await user.click(one.getByRole("button", { name: "Empty this slot" }));
    await waitFor(() => expect(api.clear).toHaveBeenCalledWith(1));
    expect(await (await slotOf(1)).findByText("Nobody yet: this slot is empty.")).toBeInTheDocument();
  });

  it("says why when a person can't be put in a slot", async () => {
    const user = userEvent.setup();
    api.set.mockRejectedValue(new ApiError(409, "That person is already in the other slot"));
    render(<SpotlightsPanel />);
    const slot = await slotOf(1);
    await user.type(slot.getByLabelText("Username"), "ann");
    await user.click(slot.getByRole("button", { name: "Show in slot 1" }));
    expect(await slot.findByRole("alert")).toHaveTextContent("That person is already in the other slot");
  });

  it("can't save without a username, and says when the slots can't be loaded", async () => {
    render(<SpotlightsPanel />);
    expect((await slotOf(1)).getByRole("button", { name: "Show in slot 1" })).toBeDisabled();
    api.slots.mockRejectedValue(new Error("down"));
    render(<SpotlightsPanel />);
    expect(await screen.findByText("Couldn't load the spotlights, try again.")).toBeInTheDocument();
  });
});
