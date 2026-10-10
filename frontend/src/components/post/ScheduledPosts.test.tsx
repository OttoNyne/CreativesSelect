import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ScheduledPosts } from "./ScheduledPosts";
import { scheduledPostsApi } from "../../api/scheduledPosts.api";
import { ApiError } from "../../api/client";
import type { Post, ScheduledPost } from "../../types";

vi.mock("../../api/scheduledPosts.api", () => ({ scheduledPostsApi: { update: vi.fn(), publishNow: vi.fn(), remove: vi.fn() } }));
const api = vi.mocked(scheduledPostsApi);

const item = (over: Partial<ScheduledPost> = {}): ScheduledPost => ({
  id: "s1",
  content: "Opening night",
  imageUrl: null,
  imageAspect: null,
  imageZoom: null,
  imagePosition: null,
  imageAlt: "",
  poll: null,
  isAiText: false,
  isAiImage: false,
  publishAt: new Date("2030-05-01T09:30").toISOString(),
  failed: false,
  failure: "",
  createdAt: "",
  ...over,
});

function show(initial: ScheduledPost[], onPublished = vi.fn()) {
  function Harness() {
    const [items, setItems] = useState(initial);
    return <ScheduledPosts items={items} onChange={setItems} onPublished={onPublished} />;
  }
  render(<Harness />);
  return onPublished;
}
const openIt = async (n = 1) => userEvent.click(screen.getByRole("button", { name: `Scheduled posts (${n})` }));

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  window.confirm = vi.fn(() => true);
});

describe("ScheduledPosts", () => {
  it("shows nothing when nothing is waiting, and the count when something is, opening to the words and the time", async () => {
    const { unmount } = render(<ScheduledPosts items={[]} onChange={vi.fn()} onPublished={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    unmount();
    show([item({ imageUrl: "https://img.example.com/a.png", poll: { options: ["Yes", "No"], days: 1 } })]);
    expect(screen.queryByText("Opening night")).toBeNull(); // closed to begin with
    await openIt();
    expect(screen.getByText("Opening night")).toBeInTheDocument();
    expect(screen.getByText(/With a picture/)).toBeInTheDocument();
    expect(screen.getByText(/With a poll/)).toBeInTheDocument();
  });

  it("changes the words and the time", async () => {
    api.update.mockResolvedValue({ post: item({ content: "Doors at eight", publishAt: new Date("2030-05-02T18:00").toISOString() }) });
    show([item()]);
    await openIt();
    await userEvent.click(screen.getByRole("button", { name: /^Edit scheduled post/ }));
    const words = screen.getByLabelText("Words");
    await userEvent.clear(words);
    await userEvent.type(words, "Doors at eight");
    fireEvent.change(screen.getByLabelText("New time"), { target: { value: "2030-05-02T18:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.update).toHaveBeenCalledWith("s1", { content: "Doors at eight", publishAt: new Date("2030-05-02T18:00").toISOString() });
    expect(await screen.findByText("Doors at eight")).toBeInTheDocument();
    expect(screen.queryByLabelText("Words")).toBeNull();
  });

  it("sends only what changed, and nothing when nothing did", async () => {
    show([item()]);
    await openIt();
    await userEvent.click(screen.getByRole("button", { name: /^Edit scheduled post/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.update).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Words")).toBeNull();
  });

  it("publishes now, handing the post to the page and taking it off the list", async () => {
    const live = { id: "p9", content: "Opening night" } as Post;
    api.publishNow.mockResolvedValue({ post: live });
    const onPublished = show([item(), item({ id: "s2", content: "Later one", publishAt: new Date("2030-06-01T09:30").toISOString() })]);
    await openIt(2);
    await userEvent.click(screen.getAllByRole("button", { name: /^Post now/ })[0]);
    await waitFor(() => expect(onPublished).toHaveBeenCalledWith(live));
    expect(api.publishNow).toHaveBeenCalledWith("s1");
    expect(screen.queryByText("Opening night")).toBeNull();
    expect(screen.getByText("Later one")).toBeInTheDocument();
  });

  it("takes one back after asking, and leaves it when the person says no", async () => {
    api.remove.mockResolvedValue(undefined as never);
    show([item()]);
    await openIt();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole("button", { name: /^Remove scheduled post/ }));
    expect(api.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /^Remove scheduled post/ }));
    expect(window.confirm).toHaveBeenLastCalledWith("Remove this scheduled post?");
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("s1"));
    expect(screen.queryByText("Opening night")).toBeNull();
  });

  it("says when one couldn't be published, with the reason, and says why an action failed", async () => {
    api.publishNow.mockRejectedValue(new ApiError(409, "Your account couldn't post at that time."));
    show([item({ failed: true, failure: "Your account couldn't post at that time." })]);
    await openIt();
    expect(screen.getByText("Couldn't be published")).toBeInTheDocument();
    expect(screen.getByText(/Your account couldn't post at that time\. Choose a new time/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Post now/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your account couldn't post at that time.");
    expect(screen.getByText("Opening night")).toBeInTheDocument();
  });
});
