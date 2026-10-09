import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MuteSettings } from "./MuteSettings";
import { MuteButton } from "../follow/MuteButton";
import { mutesApi } from "../../api/mutes.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/mutes.api", () => ({ mutesApi: { list: vi.fn(), mute: vi.fn(), unmute: vi.fn(), setWords: vi.fn() } }));
const api = vi.mocked(mutesApi);
const kai = { id: "u2", username: "kai", displayName: "Kai", avatarUrl: null };

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.list.mockResolvedValue({ people: [kai], words: ["spoilers"] });
});

const show = () =>
  render(
    <MemoryRouter>
      <MuteSettings />
    </MemoryRouter>
  );

describe("MuteSettings", () => {
  it("shows the muted words and people", async () => {
    show();
    expect(await screen.findByText("spoilers")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kai/ })).toHaveAttribute("href", "/u/kai");
    expect(screen.getByText(/Nobody is told/)).toBeInTheDocument();
  });

  it("says so when nothing is muted", async () => {
    api.list.mockResolvedValue({ people: [], words: [] });
    show();
    expect(await screen.findByText("No muted words.")).toBeInTheDocument();
    expect(screen.getByText("You haven't muted anyone.")).toBeInTheDocument();
  });

  it("adds a word, saving the whole list and showing it as kept", async () => {
    api.setWords.mockResolvedValue({ words: ["spoilers", "season finale"] });
    show();
    await screen.findByText("spoilers");
    await userEvent.type(screen.getByRole("textbox", { name: "A word or phrase to mute" }), "  Season Finale ");
    await userEvent.click(screen.getByRole("button", { name: "Mute word" }));
    expect(api.setWords).toHaveBeenCalledWith(["spoilers", "Season Finale"]);
    expect(await screen.findByText("season finale")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "A word or phrase to mute" })).toHaveValue("");
  });

  it("removes a word", async () => {
    api.setWords.mockResolvedValue({ words: [] });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Stop muting spoilers" }));
    expect(api.setWords).toHaveBeenCalledWith([]);
    await waitFor(() => expect(screen.queryByText("spoilers")).toBeNull());
  });

  it("unmutes a person", async () => {
    api.unmute.mockResolvedValue(undefined as never);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Unmute Kai" }));
    expect(api.unmute).toHaveBeenCalledWith("kai");
    await waitFor(() => expect(screen.queryByRole("link", { name: /Kai/ })).toBeNull());
  });

  it("says why a word was refused, and keeps what was typed and the list", async () => {
    api.setWords.mockRejectedValue(new ApiError(400, "You can mute up to 30 words or phrases"));
    show();
    await screen.findByText("spoilers");
    await userEvent.type(screen.getByRole("textbox", { name: "A word or phrase to mute" }), "more");
    await userEvent.click(screen.getByRole("button", { name: "Mute word" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can mute up to 30 words or phrases");
    expect(screen.getByRole("textbox", { name: "A word or phrase to mute" })).toHaveValue("more");
    expect(screen.getByText("spoilers")).toBeInTheDocument();
  });

  it("does not offer to add an empty word", async () => {
    show();
    await screen.findByText("spoilers");
    expect(screen.getByRole("button", { name: "Mute word" })).toBeDisabled();
  });
});

describe("MuteButton", () => {
  it("mutes and unmutes, telling whoever is listening", async () => {
    api.mute.mockResolvedValue({ muted: true });
    api.unmute.mockResolvedValue(undefined as never);
    const onChange = vi.fn();
    const { rerender } = render(<MuteButton username="kai" displayName="Kai" muted={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Mute Kai: their posts stop showing in your feed" }));
    expect(api.mute).toHaveBeenCalledWith("kai");
    expect(onChange).toHaveBeenLastCalledWith(true);
    rerender(<MuteButton username="kai" displayName="Kai" muted onChange={onChange} />);
    const button = screen.getByRole("button", { name: "Unmute Kai" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    expect(api.unmute).toHaveBeenCalledWith("kai");
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("says why it couldn't", async () => {
    api.mute.mockRejectedValue(new ApiError(400, "You can mute up to 500 people — unmute someone first"));
    const onChange = vi.fn();
    render(<MuteButton username="kai" displayName="Kai" muted={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^Mute Kai/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 500 people");
    expect(onChange).not.toHaveBeenCalled();
  });
});
