import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { WelcomeChecklist } from "./WelcomeChecklist";
import { onboardingApi } from "../../api/onboarding.api";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { OnboardingState, OnboardingStepKey } from "../../types";

vi.mock("../../api/onboarding.api", () => ({ onboardingApi: { get: vi.fn(), dismiss: vi.fn() } }));
vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
const api = vi.mocked(onboardingApi);

const KEYS: OnboardingStepKey[] = ["email", "avatar", "bio", "portfolio", "friend", "post"];
const state = (done: OnboardingStepKey[] = [], over: Partial<OnboardingState> = {}): OnboardingState => ({
  steps: KEYS.map((key) => ({ key, done: done.includes(key) })),
  allDone: done.length === KEYS.length,
  dismissed: false,
  show: true,
  ...over,
});

function renderIt(user: object | null = { id: "me", username: "sam_paints", displayName: "Sam Painter" }) {
  vi.mocked(useAuth).mockReturnValue({ user, isLoading: false, setUser: vi.fn(), refresh: async () => {} } as never);
  return render(
    <MemoryRouter>
      <WelcomeChecklist />
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("WelcomeChecklist", () => {
  it("greets the person by first name and lists every step with where to do it", async () => {
    api.get.mockResolvedValue(state());
    renderIt();
    expect(await screen.findByRole("heading", { name: "Welcome to CreativesSelect, Sam!" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Confirm your email address" })).toHaveAttribute("href", "/u/sam_paints?edit=1");
    expect(screen.getByRole("link", { name: "Add a profile picture" })).toHaveAttribute("href", "/u/sam_paints?edit=1");
    expect(screen.getByRole("link", { name: "Write a short bio" })).toHaveAttribute("href", "/u/sam_paints?edit=1");
    expect(screen.getByRole("link", { name: "Add your first piece to your portfolio" })).toHaveAttribute("href", "/u/sam_paints");
    expect(screen.getByRole("link", { name: "Make your first friend" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("button", { name: "Share your first post" })).toBeInTheDocument();
  });

  it("shows how far along they are, in words and as a progress bar", async () => {
    api.get.mockResolvedValue(state(["bio", "friend"]));
    renderIt();
    const bar = await screen.findByRole("progressbar", { name: "2 of 6 steps done" });
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemax", "6");
    expect(screen.getByText("2 of 6 done")).toBeInTheDocument();
  });

  it("shows a finished step as done, in words and not only by colour, and no longer as a link", async () => {
    api.get.mockResolvedValue(state(["bio"]));
    renderIt();
    await screen.findByRole("heading");
    expect(screen.getByText("Write a short bio")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Write a short bio" })).not.toBeInTheDocument();
    expect(screen.getByText("— done")).toHaveClass("sr-only");
    expect(screen.getAllByRole("link")).toHaveLength(4); // the other link steps
  });

  it("takes the person to the post box for the last step", async () => {
    api.get.mockResolvedValue(state());
    const box = document.createElement("textarea");
    box.id = "post-composer";
    document.body.appendChild(box);
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Share your first post" }));
    expect(document.activeElement).toBe(box);
    box.remove();
  });

  it("hides itself for good when asked", async () => {
    api.get.mockResolvedValue(state());
    api.dismiss.mockResolvedValue(undefined);
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Hide this" }));
    expect(api.dismiss).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument());
  });

  it("stays, and says so, if it couldn't be hidden", async () => {
    api.get.mockResolvedValue(state());
    api.dismiss.mockRejectedValue(new ApiError(500, "boom"));
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Hide this" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't hide that");
    expect(screen.getByRole("region", { name: "Getting started" })).toBeInTheDocument();
  });

  it("shows nothing when the server says not to: finished, hidden, or an older account", async () => {
    for (const over of [{ show: false, dismissed: true }, { show: false }, { show: false, allDone: true }]) {
      api.get.mockResolvedValueOnce(state([], over));
      const { container, unmount } = renderIt();
      await vi.waitFor(() => expect(api.get).toHaveBeenCalled());
      expect(container).toBeEmptyDOMElement();
      unmount();
      api.get.mockClear();
    }
  });

  it("shows nothing, and no error, when the checklist can't be loaded", async () => {
    api.get.mockRejectedValue(new ApiError(500, "boom"));
    const { container } = renderIt();
    await vi.waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing for someone who isn't signed in", async () => {
    api.get.mockResolvedValue(state());
    const { container } = renderIt(null);
    await vi.waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
