import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TasksPage } from "./TasksPage";
import { tasksApi } from "../api/tasks.api";
import { ApiError } from "../api/client";
import type { BoardTask, Task } from "../types";

vi.mock("../api/tasks.api", () => ({
  tasksApi: {
    list: vi.fn(),
    board: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    offerHelp: vi.fn(),
  },
}));
const api = vi.mocked(tasksApi);

const boardTask: BoardTask = {
  _id: "b1",
  title: "Need a logo for my zine",
  description: "Simple sketch please",
  priority: "medium",
  createdAt: new Date().toISOString(),
  author: { id: "u2", username: "zoe", displayName: "Zoe" } as never,
};
const myTask: Task = {
  _id: "t1",
  title: "Mix my EP",
  isPublic: false,
  done: false,
  priority: "medium",
  createdAt: "",
  updatedAt: "",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <TasksPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.list.mockResolvedValue([myTask]);
  api.board.mockResolvedValue({ tasks: [boardTask] });
});

describe("TasksPage (Help wanted)", () => {
  it("shows other people's open requests and my own", async () => {
    renderPage();
    expect(await screen.findByText("Need a logo for my zine")).toBeInTheDocument();
    expect(screen.getByText("Zoe")).toBeInTheDocument();
    expect(screen.getByText("Mix my EP")).toBeInTheDocument();
    expect(screen.getByText("Only me")).toBeInTheDocument();
    expect(screen.getByText("Help wanted (1)")).toBeInTheDocument();
    expect(screen.getByText("My requests (1)")).toBeInTheDocument();
  });

  it("offers help with an optional note and then shows it was sent", async () => {
    api.offerHelp.mockResolvedValue({ message: "Offer sent" });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Offer help" }));
    await userEvent.type(screen.getByPlaceholderText(/Add a note/), "Happy to sketch something");
    await userEvent.click(screen.getByRole("button", { name: "Send offer" }));

    expect(api.offerHelp).toHaveBeenCalledWith("b1", "Happy to sketch something");
    const sent = await screen.findByRole("button", { name: /Offer sent/ });
    expect(sent).toBeDisabled();
  });

  it("sends an offer with no note if none is typed, and Cancel backs out", async () => {
    api.offerHelp.mockResolvedValue({ message: "Offer sent" });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Offer help" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.offerHelp).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Offer help" }));
    await userEvent.click(screen.getByRole("button", { name: "Send offer" }));
    expect(api.offerHelp).toHaveBeenCalledWith("b1", undefined);
  });

  it("surfaces the rate-limit message when an offer is refused", async () => {
    api.offerHelp.mockRejectedValue(new ApiError(429, "Offer limit reached (20 per hour) — try again later"));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Offer help" }));
    await userEvent.click(screen.getByRole("button", { name: "Send offer" }));
    expect(await screen.findByText(/Offer limit reached/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send offer" })).toBeEnabled();
  });

  it("posts a public request by default and keeps it private when 'Only me' is ticked", async () => {
    api.create.mockResolvedValue({ ...myTask, _id: "t2" });
    renderPage();
    const input = await screen.findByPlaceholderText("What do you need help with?");

    await userEvent.type(input, "Sketch a logo");
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() =>
      expect(api.create).toHaveBeenLastCalledWith({ title: "Sketch a logo", description: undefined, isPublic: true })
    );

    await userEvent.type(screen.getByPlaceholderText("What do you need help with?"), "Private thing");
    await userEvent.click(screen.getByLabelText(/Only me/));
    await userEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() =>
      expect(api.create).toHaveBeenLastCalledWith({ title: "Private thing", description: undefined, isPublic: false })
    );
  });

  it("doesn't allow posting an empty request", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "Post" })).toBeDisabled();
  });

  it("lets me resolve, publish and delete my own requests", async () => {
    api.update.mockResolvedValue(myTask);
    api.remove.mockResolvedValue({ message: "Task deleted" });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Mark resolved" }));
    expect(api.update).toHaveBeenCalledWith("t1", { done: true });

    await userEvent.click(await screen.findByRole("button", { name: "Make public" }));
    expect(api.update).toHaveBeenCalledWith("t1", { isPublic: true });

    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(api.remove).toHaveBeenCalledWith("t1");
  });

  it("shows the load error instead of an empty page", async () => {
    api.board.mockRejectedValue(new ApiError(500, "Internal server error"));
    renderPage();
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
  });
});
