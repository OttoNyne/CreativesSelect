import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AboutMe } from "./AboutMe";
import { aboutApi } from "../../api/about.api";
import { ApiError } from "../../api/client";
import type { ProfileAbout } from "../../types";

vi.mock("../../api/about.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/about.api")>()),
  aboutApi: { get: vi.fn(), save: vi.fn() },
}));
const api = vi.mocked(aboutApi);

const empty = (over: Partial<ProfileAbout> = {}): ProfileAbout => ({ about: { interests: "", music: "", movies: "", books: "", meet: "" }, location: "", birthday: null, ...over });
const filled = (over: Partial<ProfileAbout> = {}): ProfileAbout =>
  empty({ about: { interests: "Painting <b>and</b>\nclay", music: "Jazz", movies: "", books: "The Dispossessed", meet: "People who make things" }, ...over });

beforeEach(() => {
  api.get.mockReset();
  api.save.mockReset();
});

describe("AboutMe: reading", () => {
  it("shows the answers that were given, as plain text, with their headings, and skips the empty ones", async () => {
    api.get.mockResolvedValue(filled());
    render(<AboutMe username="zoe" isOwner={false} />);
    expect(await screen.findByText("Interests")).toBeInTheDocument();
    expect(screen.getByText(/Painting <b>and<\/b>/)).toBeInTheDocument();
    expect(document.querySelector("h2 ~ div b")).toBeNull();
    expect(screen.getByText("Favourite music")).toBeInTheDocument();
    expect(screen.getByText("Who I'd like to meet")).toBeInTheDocument();
    expect(screen.queryByText("Favourite films and shows")).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("zoe");
  });

  it("shows a place and a birthday when there are some", async () => {
    api.get.mockResolvedValue(filled({ location: "Leeds, England", birthday: { month: 3, day: 4 } }));
    render(<AboutMe username="zoe" isOwner={false} />);
    expect(await screen.findByText("📍 Leeds, England")).toBeInTheDocument();
    expect(screen.getByText(/🎂 .*4/)).toBeInTheDocument();
  });

  it("shows visitors nothing at all when it is empty, or can't be loaded (a private profile)", async () => {
    api.get.mockResolvedValue(empty());
    const { container, unmount } = render(<AboutMe username="zoe" isOwner={false} />);
    await vi.waitFor(() => expect(api.get).toHaveBeenCalled());
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
    unmount();
    api.get.mockRejectedValue(new ApiError(403, "This profile is private"));
    const second = render(<AboutMe username="zoe" isOwner={false} />);
    await vi.waitFor(() => expect(second.container).toBeEmptyDOMElement());
  });

  it("shows the owner a prompt when it is empty, and a way to edit", async () => {
    api.get.mockResolvedValue(empty());
    render(<AboutMe username="me" isOwner />);
    expect(await screen.findByText(/Tell people about yourself/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("gives visitors no way to edit", async () => {
    api.get.mockResolvedValue(filled());
    render(<AboutMe username="zoe" isOwner={false} />);
    await screen.findByText("Interests");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});

describe("AboutMe: editing", () => {
  async function open(data = filled({ locationAudience: "friends" })) {
    api.get.mockResolvedValue(data);
    render(<AboutMe username="me" isOwner />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
  }

  it("starts with what is there and saves every field, then shows the result", async () => {
    await open();
    expect(screen.getByLabelText("Interests")).toHaveValue("Painting <b>and</b>\nclay");
    expect(screen.getByLabelText("Favourite films and shows")).toHaveValue("");
    await userEvent.type(screen.getByLabelText("Favourite films and shows"), "Stalker");
    await userEvent.type(screen.getByLabelText("Location"), "Leeds");
    await userEvent.selectOptions(screen.getByLabelText("Who can see your location"), "everyone");
    api.save.mockResolvedValue(filled({ location: "Leeds", locationAudience: "everyone", about: { ...filled().about, movies: "Stalker" } }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(api.save).toHaveBeenCalledWith({
      interests: "Painting <b>and</b>\nclay",
      music: "Jazz",
      movies: "Stalker",
      books: "The Dispossessed",
      meet: "People who make things",
      location: "Leeds",
      locationAudience: "everyone",
      birthday: null,
    });
    expect(await screen.findByText("Stalker")).toBeInTheDocument();
    expect(screen.getByText("📍 Leeds")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Edit About me" })).not.toBeInTheDocument();
  });

  it("shares a birthday only when the box is ticked, and sends just the month and day", async () => {
    await open();
    expect(screen.queryByLabelText("Birthday month")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Show my birthday/));
    await userEvent.selectOptions(screen.getByLabelText("Birthday month"), "3");
    await userEvent.selectOptions(screen.getByLabelText("Birthday day"), "4");
    api.save.mockResolvedValue(filled({ birthday: { month: 3, day: 4 } }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ birthday: { month: 3, day: 4 } }));
    expect(await screen.findByText(/🎂/)).toBeInTheDocument();
  });

  it("forgets the birthday when the box is unticked", async () => {
    await open(filled({ birthday: { month: 3, day: 4 }, locationAudience: "friends" }));
    expect(screen.getByLabelText(/Show my birthday/)).toBeChecked();
    expect(screen.getByLabelText("Birthday month")).toHaveValue("3");
    await userEvent.click(screen.getByLabelText(/Show my birthday/));
    api.save.mockResolvedValue(filled());
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ birthday: null }));
  });

  it("won't send a day that isn't in the month", async () => {
    await open();
    await userEvent.click(screen.getByLabelText(/Show my birthday/));
    await userEvent.selectOptions(screen.getByLabelText("Birthday month"), "4");
    await userEvent.selectOptions(screen.getByLabelText("Birthday day"), "31");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/doesn't have 31 days/);
    expect(api.save).not.toHaveBeenCalled();
    // 29 February is a real birthday
    await userEvent.selectOptions(screen.getByLabelText("Birthday month"), "2");
    await userEvent.selectOptions(screen.getByLabelText("Birthday day"), "29");
    api.save.mockResolvedValue(filled({ birthday: { month: 2, day: 29 } }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ birthday: { month: 2, day: 29 } }));
  });

  it("shows the server's reason and keeps what was typed", async () => {
    await open();
    api.save.mockRejectedValue(new ApiError(429, "You've changed a lot of things — try again later."));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("try again later");
    expect(screen.getByLabelText("Interests")).toHaveValue("Painting <b>and</b>\nclay");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("can be cancelled without saving", async () => {
    await open();
    await userEvent.type(screen.getByLabelText("Interests"), " changed");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.save).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Interests")).not.toBeInTheDocument();
    expect(screen.getByText(/Painting <b>and<\/b>/)).toBeInTheDocument();
  });
});
