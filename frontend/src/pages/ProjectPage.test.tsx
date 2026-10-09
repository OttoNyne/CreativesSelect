import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProjectPage } from "./ProjectPage";
import { ProjectsPage } from "./ProjectsPage";
import { projectsApi } from "../api/projects.api";
import { moderationApi } from "../api/moderation.api";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import type { Project, ProjectMessage, ProjectTask, User } from "../types";

vi.mock("../api/projects.api", () => ({ projectsApi: { list: vi.fn(), get: vi.fn(), update: vi.fn(), remove: vi.fn(), leave: vi.fn(), removeMember: vi.fn(), messages: vi.fn(), send: vi.fn(), deleteMessage: vi.fn(), addTask: vi.fn(), setTask: vi.fn(), removeTask: vi.fn() } }));
vi.mock("../api/moderation.api", () => ({ moderationApi: { report: vi.fn().mockResolvedValue({ report: {} }) } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../components/common/CommentPicturePicker", () => ({
  CommentPicturePicker: ({ url, onChange }: { url: string | null; onChange: (u: string | null) => void }) => (
    <button type="button" onClick={() => onChange(url ? null : "https://cdn.example.com/up.png")}>
      {url ? "fake-remove-picture" : "fake-add-picture"}
    </button>
  ),
}));
vi.mock("../lib/liveUpdates", () => ({ liveUpdates: { subscribe: vi.fn(() => () => {}), isConnected: () => false, onConnection: () => () => {} } }));
const api = vi.mocked(projectsApi);

const person = (id: string, name: string, isOwner = false) => ({ id, username: name.toLowerCase(), displayName: name, avatarUrl: null, csVerified: false, isOwner });
const room = (over: Partial<Project> = {}): Project => ({
  id: "r1",
  callId: "c1",
  title: "EP sessions",
  status: "active",
  lastActivityAt: new Date().toISOString(),
  owner: "u-owner",
  isOwner: false,
  members: [person("u-owner", "Zoe", true), person("me", "Me")],
  tasks: [],
  ...over,
});
const message = (id: string, content: string, who = "Zoe", mine = false): ProjectMessage => ({ id, content, imageUrl: null, createdAt: new Date().toISOString(), mine, author: person(mine ? "me" : "u-owner", who) });
const task = (id: string, text: string, done = false, createdBy = "me"): ProjectTask => ({ id, text, done, doneBy: null, createdBy, createdAt: "" });

function show(path = "/projects/r1") {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "me", username: "me", displayName: "Me" } as User, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.get.mockResolvedValue({ project: room() });
  api.messages.mockResolvedValue({ messages: [message("m1", "Welcome to the room")], hasMore: false });
  window.confirm = vi.fn(() => true);
  vi.mocked(moderationApi.report).mockClear();
});

describe("ProjectsPage", () => {
  it("lists your rooms with what is new, what is to do and who is in them", async () => {
    api.list.mockResolvedValue({ projects: [room({ unread: 3, openTasks: 2 }), room({ id: "r2", title: "Cover art", status: "archived", members: [person("u-owner", "Zoe", true)] })] });
    show("/projects");
    expect(await screen.findByRole("link", { name: "EP sessions" })).toHaveAttribute("href", "/projects/r1");
    expect(screen.getByText("3 new")).toBeInTheDocument();
    expect(screen.getByText("2 things to do")).toBeInTheDocument();
    expect(screen.getByText("2 people")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByText("1 person")).toBeInTheDocument();
  });

  it("says how a room opens when there are none, and when the list can't be loaded", async () => {
    api.list.mockResolvedValue({ projects: [] });
    show("/projects");
    expect(await screen.findByText(/One opens when you are chosen/)).toBeInTheDocument();
  });

  it("says when the list can't be loaded", async () => {
    api.list.mockRejectedValue(new ApiError(500, "Server error"));
    show("/projects");
    expect(await screen.findByRole("alert")).toHaveTextContent("Server error");
  });
});

describe("ProjectPage: a member", () => {
  it("shows who is in the room, the checklist and the chat", async () => {
    api.get.mockResolvedValue({ project: room({ tasks: [task("t1", "Send the stems")] }) });
    show();
    expect(await screen.findByRole("heading", { name: "EP sessions" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "People" })).getByText("Zoe")).toBeInTheDocument();
    expect(screen.getByText("· Owner")).toBeInTheDocument();
    expect(await screen.findByText("Welcome to the room")).toBeInTheDocument();
    expect(screen.getByText("Send the stems")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive project" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove Zoe/ })).toBeNull();
  });

  it("writes in the chat with words and a picture, and the new message appears", async () => {
    api.send.mockResolvedValue({ message: { ...message("m2", "Here is the demo", "Me", true), imageUrl: "https://cdn.example.com/up.png" } });
    show();
    await screen.findByText("Welcome to the room");
    await userEvent.type(screen.getByRole("textbox", { name: "Write a message" }), "Here is the demo");
    await userEvent.click(screen.getByRole("button", { name: "fake-add-picture" }));
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(api.send).toHaveBeenCalledWith("r1", { content: "Here is the demo", imageUrl: "https://cdn.example.com/up.png" });
    expect(await screen.findByText("Here is the demo")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Write a message" })).toHaveValue("");
  });

  it("says why a message wasn't sent and keeps what was written", async () => {
    api.send.mockRejectedValue(new ApiError(409, "This project is archived"));
    show();
    await screen.findByText("Welcome to the room");
    await userEvent.type(screen.getByRole("textbox", { name: "Write a message" }), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("archived");
    expect(screen.getByRole("textbox", { name: "Write a message" })).toHaveValue("Hello");
  });

  it("shows earlier messages on request", async () => {
    api.messages.mockResolvedValueOnce({ messages: [message("m5", "Newest")], hasMore: true }).mockResolvedValueOnce({ messages: [message("m1", "Oldest")], hasMore: false });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Show earlier messages" }));
    expect(api.messages).toHaveBeenLastCalledWith("r1", "m5");
    const items = await screen.findAllByRole("listitem");
    expect(items.map((li) => li.textContent).join("|")).toMatch(/Oldest.*Newest/);
    expect(screen.queryByRole("button", { name: "Show earlier messages" })).toBeNull();
  });

  it("deletes your own message after asking, and can only report other people's", async () => {
    api.messages.mockResolvedValue({ messages: [message("m1", "Theirs"), message("m2", "Mine", "Me", true)], hasMore: false });
    api.deleteMessage.mockResolvedValue(undefined as never);
    show();
    await screen.findByText("Mine");
    expect(screen.getAllByRole("button", { name: "Delete message" })).toHaveLength(1); // not the owner: only their own
    await userEvent.click(screen.getByRole("button", { name: "Delete message" }));
    expect(window.confirm).toHaveBeenCalledWith("Delete this message?");
    expect(api.deleteMessage).toHaveBeenCalledWith("r1", "m2");
    await waitFor(() => expect(screen.queryByText("Mine")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Report this message from Zoe" }));
    await userEvent.type(screen.getByLabelText("What's the issue?"), "Rude");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(moderationApi.report).toHaveBeenCalledWith("projectMessage", "m1", "Rude");
  });

  it("adds, ticks off and removes things on the checklist", async () => {
    api.get.mockResolvedValue({ project: room({ tasks: [task("t1", "Send the stems")] }) });
    api.addTask.mockResolvedValue({ task: task("t2", "Book the studio") });
    api.setTask.mockResolvedValue({ task: task("t1", "Send the stems", true) });
    api.removeTask.mockResolvedValue(undefined as never);
    show();
    await screen.findByText("Send the stems");
    await userEvent.type(screen.getByRole("textbox", { name: "Something that needs doing" }), "Book the studio");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(api.addTask).toHaveBeenCalledWith("r1", "Book the studio");
    expect(await screen.findByText("Book the studio")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Mark done: Send the stems" }));
    expect(api.setTask).toHaveBeenCalledWith("r1", "t1", { done: true });
    expect(await screen.findByRole("checkbox", { name: "Mark not done: Send the stems" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Remove: Book the studio" }));
    expect(api.removeTask).toHaveBeenCalledWith("r1", "t2");
    await waitFor(() => expect(screen.queryByText("Book the studio")).toBeNull());
  });

  it("leaves the room after asking", async () => {
    api.leave.mockResolvedValue(undefined as never);
    api.list.mockResolvedValue({ projects: [] });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Leave project" }));
    expect(window.confirm).toHaveBeenCalledWith("Leave this project? What you wrote stays.");
    expect(api.leave).toHaveBeenCalledWith("r1");
    expect(await screen.findByText(/You're not in any project rooms yet/)).toBeInTheDocument();
  });

  it("says when the room isn't there", async () => {
    api.get.mockRejectedValue(new ApiError(404, "Project not found"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("This project isn't available.");
  });
});

describe("ProjectPage: the owner", () => {
  const owned = (over: Partial<Project> = {}) => room({ isOwner: true, owner: "me", members: [person("me", "Me", true), person("u-kai", "Kai")], ...over });

  it("renames the room", async () => {
    api.get.mockResolvedValue({ project: owned() });
    api.update.mockResolvedValue({ project: owned({ title: "EP final" }) });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Rename" }));
    const box = screen.getByRole("textbox", { name: "Project name" });
    await userEvent.clear(box);
    await userEvent.type(box, "EP final");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.update).toHaveBeenCalledWith("r1", { title: "EP final" });
    expect(await screen.findByRole("heading", { name: "EP final" })).toBeInTheDocument();
  });

  it("archives the room, after which nothing can be written, and brings it back", async () => {
    api.get.mockResolvedValue({ project: owned() });
    api.update.mockResolvedValueOnce({ project: owned({ status: "archived" }) }).mockResolvedValueOnce({ project: owned() });
    show();
    await screen.findByText("Welcome to the room");
    await userEvent.click(screen.getByRole("button", { name: "Archive project" }));
    expect(api.update).toHaveBeenLastCalledWith("r1", { status: "archived" });
    expect(await screen.findByText(/This project is archived: it can be read/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Write a message" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Something that needs doing" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Bring project back" }));
    expect(await screen.findByRole("textbox", { name: "Write a message" })).toBeInTheDocument();
  });

  it("removes someone after asking, and can delete anyone's message", async () => {
    api.get.mockResolvedValue({ project: owned() });
    api.removeMember.mockResolvedValue(undefined as never);
    api.messages.mockResolvedValue({ messages: [message("m1", "From Kai", "Kai")], hasMore: false });
    show();
    await screen.findByText("From Kai");
    expect(screen.getByRole("button", { name: "Delete message" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Kai from the project" }));
    expect(api.removeMember).toHaveBeenCalledWith("r1", "u-kai");
    expect(screen.queryByRole("button", { name: "Remove Me from the project" })).toBeNull();
  });

  it("deletes the room after asking", async () => {
    api.get.mockResolvedValue({ project: owned() });
    api.remove.mockResolvedValue(undefined as never);
    api.list.mockResolvedValue({ projects: [] });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Delete project" }));
    expect(window.confirm).toHaveBeenCalledWith("Delete this project for everyone, with its chat and checklist?");
    expect(api.remove).toHaveBeenCalledWith("r1");
    expect(await screen.findByText(/You're not in any project rooms yet/)).toBeInTheDocument();
  });
});
