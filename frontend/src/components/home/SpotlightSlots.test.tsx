import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SpotlightSlots } from "./SpotlightSlots";
import { spotlightsApi, type Spotlight } from "../../api/spotlights.api";

vi.mock("../../api/spotlights.api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../api/spotlights.api")>()), spotlightsApi: { list: vi.fn() } }));
const api = vi.mocked(spotlightsApi);

const spot = (slot: 1 | 2, name: string, over: Partial<Spotlight> = {}): Spotlight => ({
  slot,
  note: "",
  user: { id: name, username: name.toLowerCase(), displayName: name, avatarUrl: null, headline: "", csVerified: false, tags: [] },
  piece: null,
  ...over,
});
const show = () =>
  render(
    <MemoryRouter>
      <SpotlightSlots />
    </MemoryRouter>
  );

beforeEach(() => api.list.mockReset());

describe("SpotlightSlots", () => {
  it("shows both people, each with their name, headline, the line written about them and tags, and a way to their profile", async () => {
    api.list.mockResolvedValue({
      spotlights: [
        spot(1, "Ann", { note: "Her murals are everywhere", user: { ...spot(1, "Ann").user, headline: "Illustrator · open to commissions", tags: ["painter", "muralist"], csVerified: true }, piece: { id: "m1", url: "https://img.example.com/mural.png", caption: "A mural" } }),
        spot(2, "Ben"),
      ],
    });
    show();
    const region = await screen.findByRole("region", { name: "Artist spotlights" });
    expect(within(region).getAllByRole("listitem").filter((li) => li.querySelector("h2, a"))).toBeTruthy();
    expect(within(region).getByRole("link", { name: "Ann" })).toHaveAttribute("href", "/u/ann");
    expect(within(region).getByText("Illustrator · open to commissions")).toBeInTheDocument();
    expect(within(region).getByText("Her murals are everywhere")).toBeInTheDocument();
    expect(within(region).getByText("#painter")).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: "View Ann's profile" })).toHaveAttribute("href", "/u/ann");
    expect(within(region).getByRole("link", { name: "View Ben's profile" })).toHaveAttribute("href", "/u/ben");
    // Ann's picture is shown; Ben, with none, gets his photo's place
    expect(region.querySelectorAll("img[src='https://img.example.com/mural.png']")).toHaveLength(1);
  });

  it("shows one person on their own when only one slot is filled", async () => {
    api.list.mockResolvedValue({ spotlights: [spot(2, "Ben")] });
    show();
    expect(await screen.findByRole("link", { name: "Ben" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ann" })).toBeNull();
  });

  it("shows nothing at all until they have loaded, when nobody is chosen, and when they can't be loaded", async () => {
    let finish!: (v: { spotlights: Spotlight[] }) => void;
    api.list.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const first = show();
    expect(first.container).toBeEmptyDOMElement();
    finish({ spotlights: [] });
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();
    api.list.mockRejectedValueOnce(new Error("offline"));
    const second = show();
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });

  it("draws what an administrator typed as plain text, never as markup", async () => {
    api.list.mockResolvedValue({ spotlights: [spot(1, "Ann", { note: "<img src=x onerror=alert(1)> loves <b>clay</b>" })] });
    show();
    expect(await screen.findByText("<img src=x onerror=alert(1)> loves <b>clay</b>")).toBeInTheDocument();
    expect(document.querySelector("img[onerror]")).toBeNull();
  });
});
