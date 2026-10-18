import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SketchPage } from "./SketchPage";
import { challengesApi } from "../api/challenges.api";
import { ApiError } from "../api/client";
import { uploadFile } from "../api/media.api";
import { useAuth } from "../context/AuthContext";
import type { MediaItem, User } from "../types";

vi.mock("../api/media.api", () => ({ uploadFile: vi.fn() }));
vi.mock("../api/challenges.api", () => ({ challengesApi: { enter: vi.fn() } }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));

const upload = vi.mocked(uploadFile);
const enter = vi.mocked(challengesApi.enter);
const me = { id: "me", username: "ann", displayName: "Ann", isPrivate: false } as User;
const posted = { id: "m1", url: "https://img.example.com/sketch.png", type: "image", caption: "x" } as unknown as MediaItem;

const ctx = { strokeStyle: "", fillStyle: "", lineWidth: 0, beginPath() {}, moveTo() {}, quadraticCurveTo() {}, arc() {}, fill() {}, stroke() {}, fillRect() {} };

beforeEach(() => {
  upload.mockReset();
  enter.mockReset();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob(["png"], { type: "image/png" })));
});

function show(viewer: User | null = me, url = "/sketch") {
  vi.mocked(useAuth).mockReturnValue({ user: viewer, isLoading: false, setUser: vi.fn(), refresh: async () => {} });
  render(
    <MemoryRouter initialEntries={[url]}>
      <SketchPage />
    </MemoryRouter>
  );
}
const drawSomething = () => {
  const canvas = screen.getByRole("img", { name: /Drawing area/ });
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10, button: 0 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 80, clientY: 50 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
};

describe("SketchPage", () => {
  it("offers the dice before there is a spark, and a way to leave it once one is chosen", async () => {
    const user = userEvent.setup();
    show();
    expect(screen.getByRole("region", { name: "Need a spark?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use today's spark" }));
    expect(screen.queryByRole("region", { name: "Need a spark?" })).toBeNull();
    expect(screen.getByText(/^Drawing: /)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Draw anything" }));
    expect(screen.getByRole("region", { name: "Need a spark?" })).toBeInTheDocument();
  });

  it("opens with the spark from a link, in the reader's own language, and starts the caption from it", () => {
    show(me, "/sketch?spark=1-1-1");
    expect(screen.getByText("Drawing: A lighthouse, upside down. Only three colors.")).toBeInTheDocument();
    expect(screen.getByLabelText("Caption")).toHaveValue("A lighthouse, upside down. Only three colors. #sketchpad");
  });

  it("ignores a spark in a link that isn't one", () => {
    show(me, "/sketch?spark=999-1-1");
    expect(screen.getByRole("region", { name: "Need a spark?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Caption")).toHaveValue("#sketchpad");
  });

  it("will not post a blank page", () => {
    show();
    expect(screen.getByRole("button", { name: "Post to my portfolio" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download picture" })).toBeDisabled();
  });

  it("posts the drawing as a PNG to the portfolio with the caption, and then shows it with the next steps", async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue({ url: posted.url, mediaItem: posted });
    show();
    drawSomething();
    const caption = screen.getByLabelText("Caption");
    await user.clear(caption);
    await user.type(caption, "My quick fox #sketchpad");
    await user.click(screen.getByRole("button", { name: "Post to my portfolio" }));
    await waitFor(() => expect(upload).toHaveBeenCalled());
    const [file, purpose, words] = upload.mock.calls[0];
    expect(file).toBeInstanceOf(File);
    expect((file as File).type).toBe("image/png");
    expect(purpose).toBe("portfolio");
    expect(words).toBe("My quick fox #sketchpad");
    expect(await screen.findByText("Posted! It is now in your portfolio.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See it on my profile" })).toHaveAttribute("href", "/u/ann");
    // the finished draft is not kept for next time
    expect(localStorage.getItem("cs-sketch-draft")).toBeNull();
  });

  it("can enter the drawing in this week's challenge, and says so when that fails", async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue({ url: posted.url, mediaItem: posted });
    enter.mockRejectedValueOnce(new ApiError(409, "You've already entered this week")).mockResolvedValueOnce({ entry: { id: "e", item: posted } });
    show();
    drawSomething();
    await user.click(screen.getByRole("button", { name: "Post to my portfolio" }));
    await user.click(await screen.findByRole("button", { name: "Enter it in this week's challenge" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You've already entered this week");
    await user.click(screen.getByRole("button", { name: "Enter it in this week's challenge" }));
    expect(await screen.findByText(/You're in this week's challenge/)).toBeInTheDocument();
    expect(enter).toHaveBeenLastCalledWith("m1");
    expect(screen.queryByRole("button", { name: "Enter it in this week's challenge" })).toBeNull();
  });

  it("does not offer the challenge to a private account, which can't take part", async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue({ url: posted.url, mediaItem: posted });
    show({ ...me, isPrivate: true });
    drawSomething();
    await user.click(screen.getByRole("button", { name: "Post to my portfolio" }));
    await screen.findByText("Posted! It is now in your portfolio.");
    expect(screen.queryByRole("button", { name: "Enter it in this week's challenge" })).toBeNull();
  });

  it("says why when the drawing can't be posted, and keeps the drawing so it can be tried again", async () => {
    const user = userEvent.setup();
    upload.mockRejectedValueOnce(new ApiError(400, "Your portfolio is full (200 pieces) — remove one to add another")).mockRejectedValueOnce(new Error("offline"));
    show();
    drawSomething();
    await user.click(screen.getByRole("button", { name: "Post to my portfolio" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your portfolio is full");
    await user.click(screen.getByRole("button", { name: "Post to my portfolio" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't post the drawing, try again."));
    expect(screen.getByRole("button", { name: "Post to my portfolio" })).toBeEnabled();
  });

  it("lets someone who isn't signed in draw and download, and asks them to sign up to post", () => {
    show(null);
    expect(screen.queryByLabelText("Caption")).toBeNull();
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register");
    drawSomething();
    expect(screen.getByRole("button", { name: "Download picture" })).toBeEnabled();
  });

  it("starts a fresh page after posting", async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue({ url: posted.url, mediaItem: posted });
    show();
    drawSomething();
    await user.click(screen.getByRole("button", { name: "Post to my portfolio" }));
    await user.click(await screen.findByRole("button", { name: "Draw another" }));
    expect(screen.getByRole("img", { name: /Drawing area/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post to my portfolio" })).toBeDisabled();
  });
});
