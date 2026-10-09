import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostPoll } from "./PostPoll";
import { useAuth } from "../../context/AuthContext";
import { postsApi } from "../../api/posts.api";
import { ApiError } from "../../api/client";
import type { PostPoll as Poll, User } from "../../types";

vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../api/posts.api", () => ({ postsApi: { vote: vi.fn() } }));

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000 + 3_600_000).toISOString();
const poll = (over: Partial<Poll> = {}): Poll => ({ options: [{ text: "Blue", votes: 0 }, { text: "Green", votes: 0 }], total: 0, endsAt: inDays(2), closed: false, myVote: null, ...over });

function show(p: Poll, signedIn = true) {
  vi.mocked(useAuth).mockReturnValue({ user: signedIn ? ({ id: "me" } as User) : null, isLoading: false, setUser: () => {}, refresh: async () => {} });
  render(<PostPoll postId="p1" poll={p} />);
}

beforeEach(() => {
  vi.mocked(postsApi.vote).mockReset();
});

describe("PostPoll", () => {
  it("lets someone who has not voted choose an option, then shows how it stands with their choice marked", async () => {
    vi.mocked(postsApi.vote).mockResolvedValue({ poll: poll({ options: [{ text: "Blue", votes: 1 }, { text: "Green", votes: 3 }], total: 4, myVote: 1 }) });
    show(poll({ options: [{ text: "Blue", votes: 1 }, { text: "Green", votes: 2 }], total: 3 }));
    expect(screen.getByRole("group", { name: "Poll" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vote for Green" }));
    expect(postsApi.vote).toHaveBeenCalledWith("p1", 1);
    expect(screen.queryByRole("button", { name: /Vote for/ })).toBeNull();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText(/Your vote/)).toBeInTheDocument();
    expect(screen.getByText(/4 votes/)).toBeInTheDocument();
  });

  it("shows results, not buttons, to someone who already voted", () => {
    show(poll({ options: [{ text: "Blue", votes: 2 }, { text: "Green", votes: 0 }], total: 2, myVote: 0 }));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText(/2 votes/)).toBeInTheDocument();
    expect(screen.getByText(/2 days left/)).toBeInTheDocument();
  });

  it("shows a closed poll as final results with no way to vote", () => {
    show(poll({ closed: true, total: 1, options: [{ text: "Blue", votes: 1 }, { text: "Green", votes: 0 }] }));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Final results/)).toBeInTheDocument();
    expect(screen.getByText(/1 vote(?!s)/)).toBeInTheDocument();
  });

  it("shows only the results to someone who is not signed in", () => {
    show(poll(), false);
    expect(screen.queryByRole("button")).toBeNull();
    expect(within(screen.getByRole("group", { name: "Poll" })).getByText("Blue")).toBeInTheDocument();
  });

  it("says why a vote did not count, and keeps the choices", async () => {
    vi.mocked(postsApi.vote).mockRejectedValue(new ApiError(400, "This poll has ended"));
    show(poll());
    await userEvent.click(screen.getByRole("button", { name: "Vote for Blue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This poll has ended");
    expect(screen.getByRole("button", { name: "Vote for Green" })).toBeInTheDocument();
  });
});
