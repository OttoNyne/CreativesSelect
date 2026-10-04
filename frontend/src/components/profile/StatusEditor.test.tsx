import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { StatusEditor, TagEditor } from "./StatusEditor";
import { profilesApi } from "../../api/profiles.api";
import { usePlayback } from "../../context/PlaybackContext";

vi.mock("../../api/profiles.api", () => ({ profilesApi: { tags: vi.fn() } }));
vi.mock("../../context/PlaybackContext", () => ({ usePlayback: vi.fn() }));
const tagsApi = vi.mocked(profilesApi.tags);

beforeEach(() => {
  tagsApi.mockReset();
  tagsApi.mockResolvedValue({ tags: [{ tag: "potter", count: 3 }, { tag: "painter", count: 2 }] });
  vi.mocked(usePlayback).mockReturnValue({ current: null } as never);
});

function Status({ playing }: { playing?: string }) {
  vi.mocked(usePlayback).mockReturnValue({ current: playing ? { title: playing } : null } as never);
  const [mood, setMood] = useState("");
  const [listening, setListening] = useState("");
  return <StatusEditor mood={mood} listeningTo={listening} onMood={setMood} onListeningTo={setListening} />;
}

function Tags({ start = [] as string[] }) {
  const [tags, setTags] = useState(start);
  return <TagEditor tags={tags} onChange={setTags} />;
}

describe("StatusEditor", () => {
  it("edits the mood and listening-to lines", async () => {
    render(<Status />);
    await userEvent.type(screen.getByLabelText("Mood"), "calm");
    await userEvent.type(screen.getByLabelText("Listening to"), "Kind of Blue");
    expect(screen.getByLabelText("Mood")).toHaveValue("calm");
    expect(screen.getByLabelText("Listening to")).toHaveValue("Kind of Blue");
  });

  it("offers what's playing only while something is, and fills it in on request", async () => {
    const { unmount } = render(<Status />);
    expect(screen.queryByRole("button", { name: /Use what/ })).not.toBeInTheDocument();
    unmount();

    render(<Status playing="So What" />);
    await userEvent.click(screen.getByRole("button", { name: /Use what/ }));
    expect(screen.getByLabelText("Listening to")).toHaveValue("So What");
  });
});

describe("TagEditor", () => {
  it("adds a tag with Enter, in its stored form, and clears the box", async () => {
    render(<Tags />);
    const box = screen.getByLabelText(/What do you do/);
    await userEvent.type(box, "#Potter{enter}");
    expect(screen.getByRole("list", { name: "Your tags" })).toHaveTextContent("#potter");
    expect(box).toHaveValue("");
  });

  it("adds a tag when a comma ends it, keeping what follows", async () => {
    render(<Tags />);
    const box = screen.getByLabelText(/What do you do/);
    await userEvent.type(box, "potter,lo");
    expect(screen.getByRole("list", { name: "Your tags" })).toHaveTextContent("#potter");
    expect(box).toHaveValue("lo");
  });

  it("removes a tag with its button, and the last one with Backspace on an empty box", async () => {
    render(<Tags start={["potter", "painter", "dj"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove tag potter" }));
    expect(screen.queryByText(/#potter/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/What do you do/), "{backspace}");
    expect(screen.queryByText(/#dj/)).not.toBeInTheDocument();
    expect(screen.getByText(/#painter/)).toBeInTheDocument();
  });

  it("explains a bad or repeated tag and won't add it", async () => {
    render(<Tags start={["potter"]} />);
    const box = screen.getByLabelText(/What do you do/);
    await userEvent.type(box, "x");
    expect(screen.getByRole("alert")).toHaveTextContent(/Use 2–24/);
    expect(screen.getByRole("button", { name: "Add tag" })).toBeDisabled();
    await userEvent.clear(box);
    await userEvent.type(box, "Potter{enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(/already have "potter"/);
    expect(screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("#potter"))).toHaveLength(1);
  });

  it("stops offering the box at the limit", () => {
    render(<Tags start={Array.from({ length: 8 }, (_, i) => `tag${i}`)} />);
    expect(screen.queryByLabelText(/What do you do/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Add tag" })).not.toBeInTheDocument();
  });

  it("suggests tags other people use, leaving out the ones already chosen, narrowed by what's typed", async () => {
    render(<Tags start={["potter"]} />);
    await waitFor(() => expect(document.querySelectorAll("datalist option")).toHaveLength(1));
    expect(document.querySelector("datalist option")).toHaveAttribute("value", "painter");

    await userEvent.type(screen.getByLabelText(/What do you do/), "pa");
    await waitFor(() => expect(tagsApi).toHaveBeenLastCalledWith("pa"));
  });

  it("still works when suggestions can't be loaded", async () => {
    tagsApi.mockRejectedValue(new Error("offline"));
    render(<Tags />);
    await userEvent.type(screen.getByLabelText(/What do you do/), "dj{enter}");
    expect(screen.getByRole("list", { name: "Your tags" })).toHaveTextContent("#dj");
  });
});
