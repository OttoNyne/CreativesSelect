import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage";
import { LandingPage } from "./LandingPage";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

vi.mock("./FeedPage", () => ({ FeedPage: () => <div>the feed</div> }));
vi.mock("../components/home/SpotlightSlots", () => ({ SpotlightSlots: () => <div>the spotlights</div> }));
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));

const as = (user: User | null, isLoading = false) => vi.mocked(useAuth).mockReturnValue({ user, isLoading, setUser: vi.fn(), refresh: async () => {} });
const show = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => vi.mocked(useAuth).mockReset());

describe("HomePage: the main screen", () => {
  it("is the feed for someone who is signed in", () => {
    as({ id: "u1", username: "zoe", displayName: "Zoe" } as User);
    show(<HomePage />);
    expect(screen.getByText("the feed")).toBeInTheDocument();
    expect(screen.queryByText("the spotlights")).toBeNull();
  });

  it("is the landing page for everyone else", () => {
    as(null);
    show(<HomePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Show your work. Get found. Get hired." })).toBeInTheDocument();
    expect(screen.queryByText("the feed")).toBeNull();
  });

  it("shows neither while it is still finding out who is signed in", () => {
    as(null, true);
    show(<HomePage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("the feed")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });
});

describe("LandingPage", () => {
  it("says what the site is, shows the spotlights and invites people to join or log in", () => {
    show(<LandingPage />);
    expect(screen.getByText(/The professional network for creatives/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join CreativesSelect" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByText("the spotlights")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A profile that leads with your work" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Be found, and get hired" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Make things together" })).toBeInTheDocument();
  });
});
