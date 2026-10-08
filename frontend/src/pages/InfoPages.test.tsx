import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AboutPage } from "./AboutPage";
import { FeaturesPage } from "./FeaturesPage";
import { HowItWorksPage } from "./HowItWorksPage";
import { SiteFooter } from "../components/layout/SiteFooter";
import { useAuth } from "../context/AuthContext";
import { titleForPath } from "../lib/usePageTitle";
import type { User } from "../types";

vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));

function renderPage(page: React.ReactElement, user: User | null = null) {
  vi.mocked(useAuth).mockReturnValue({ user, isLoading: false, setUser: vi.fn(), refresh: vi.fn() });
  return render(<MemoryRouter>{page}</MemoryRouter>);
}
const ada = { id: "u1", username: "ada" } as User;

beforeEach(() => vi.mocked(useAuth).mockReset());

describe("AboutPage", () => {
  it("explains what the site is, who it's for and the control people have", () => {
    renderPage(<AboutPage />);
    expect(screen.getByRole("heading", { level: 1, name: "About CreativesSelect" })).toBeInTheDocument();
    for (const h of ["Why it exists", "Who it's for", "You're in control"]) {
      expect(screen.getByRole("heading", { level: 2, name: h })).toBeInTheDocument();
    }
    expect(screen.getByText(/never shown to other people/)).toBeInTheDocument();
  });

  it("links on to the other two pages", () => {
    renderPage(<AboutPage />);
    expect(screen.getByRole("link", { name: "features" })).toHaveAttribute("href", "/features");
    expect(screen.getByRole("link", { name: "how it works" })).toHaveAttribute("href", "/how-it-works");
  });
});

describe("FeaturesPage", () => {
  it("lists what the site offers, each with its own heading", () => {
    renderPage(<FeaturesPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Features" })).toBeInTheDocument();
    for (const name of ["A profile that's yours", "Portfolio", "Music", "Feed", "Messages and group chat", "Friends and groups", "Help wanted", "Live audio", "AI assistance", "Privacy and safety", "Credits and collaborations", "Open to work", "Shareable profiles", "Works on your phone", "In your language"]) {
      expect(screen.getByRole("heading", { level: 2, name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("listitem")).toHaveLength(15);
  });

  it("is honest that AI content is labelled", () => {
    renderPage(<FeaturesPage />);
    expect(screen.getByText(/clearly labelled/)).toBeInTheDocument();
  });
});

describe("HowItWorksPage", () => {
  it("walks through five numbered steps in order", () => {
    renderPage(<HowItWorksPage />);
    expect(screen.getByRole("heading", { level: 1, name: "How it works" })).toBeInTheDocument();
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(5);
    const titles = steps.map((s) => within(s).getByRole("heading", { level: 2 }).textContent);
    expect(titles).toEqual(["Create your account", "Make it yours", "Connect", "Share and collaborate", "Stay in control"]);
    expect(steps[0]).toHaveTextContent("1");
    expect(steps[4]).toHaveTextContent("5");
  });
});

describe.each([
  ["About", AboutPage],
  ["Features", FeaturesPage],
  ["How it works", HowItWorksPage],
])("%s: the way onward", (_name, Page) => {
  it("invites a visitor who isn't signed in to join or log in", () => {
    renderPage(<Page />);
    expect(screen.getByRole("link", { name: "Create your account" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: "Go to your feed" })).not.toBeInTheDocument();
  });

  it("sends someone who is signed in back to their feed instead", () => {
    renderPage(<Page />, ada);
    expect(screen.getByRole("link", { name: "Go to your feed" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "Create your account" })).not.toBeInTheDocument();
  });

  it("has exactly one main landmark and one top-level heading", () => {
    renderPage(<Page />);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("SiteFooter", () => {
  it("links to the three information pages", () => {
    renderPage(<SiteFooter />);
    const nav = screen.getByRole("navigation", { name: "About this site" });
    expect(within(nav).getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(within(nav).getByRole("link", { name: "Features" })).toHaveAttribute("href", "/features");
    expect(within(nav).getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/how-it-works");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("CreativesSelect");
  });
});

describe("page titles", () => {
  it("names each information page", () => {
    expect(titleForPath("/about")).toBe("About · CreativesSelect");
    expect(titleForPath("/features")).toBe("Features · CreativesSelect");
    expect(titleForPath("/how-it-works")).toBe("How it works · CreativesSelect");
  });
});
