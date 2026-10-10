import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LegalPage } from "./LegalPage";
import { NotFoundPage } from "./NotFoundPage";
import { RegisterPage } from "./RegisterPage";
import { SiteFooter } from "../components/layout/SiteFooter";
import { useAuth } from "../context/AuthContext";
import { titleForPath } from "../lib/usePageTitle";

vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../api/auth.api", () => ({ authApi: { register: vi.fn() } }));
vi.mock("../api/invites.api", () => ({ invitesApi: { preview: vi.fn() } }));

function signedOut() {
  vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false, setUser: vi.fn(), refresh: vi.fn() });
}
const page = (path: string, element: React.ReactElement) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  signedOut();
});

describe("the policy pages", () => {
  it.each([
    ["privacy", "Privacy Policy", 10, "What we keep"],
    ["terms", "Terms of Use", 9, "Using the site"],
    ["guidelines", "Community guidelines", 7, "Be kind to people, honest about work"],
  ] as const)("%s: a heading, the date, every numbered section and a way to get in touch", (doc, title, sections, first) => {
    page(`/${doc}`, <LegalPage doc={doc} />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText("Last updated: October 10, 2026")).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings).toHaveLength(sections);
    expect(headings[0]).toHaveTextContent(first);
    // no section is empty, and nothing is a missing key
    for (const h of headings) {
      expect(h.textContent).not.toMatch(/^legal\./);
      expect(h.nextElementSibling?.textContent?.length ?? 0).toBeGreaterThan(20);
    }
    // no address is set in tests, so it points to the Report button rather than showing a made-up one
    expect(screen.getByText(/use the Report button on anything on the site/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/legal\.[a-z]+\.\d/);
  });

  it("says the things a person needs to know before agreeing", () => {
    page("/privacy", <LegalPage doc="privacy" />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/no advertising and no analytics or tracking scripts/);
    expect(text).toMatch(/Download my data/);
    expect(text).toMatch(/Delete my account/);
    expect(text).toMatch(/aged 13 and over/);
  });

  it("have a title in the browser tab", () => {
    expect(titleForPath("/privacy")).toBe("Privacy Policy · CreativesSelect");
    expect(titleForPath("/terms")).toBe("Terms of Use · CreativesSelect");
    expect(titleForPath("/guidelines")).toBe("Community guidelines · CreativesSelect");
  });
});

describe("the footer", () => {
  it("links to all three policy pages, signed in or not", () => {
    render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>
    );
    const nav = screen.getByRole("navigation", { name: "About this site" });
    expect(within(nav).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(within(nav).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(within(nav).getByRole("link", { name: "Community guidelines" })).toHaveAttribute("href", "/guidelines");
  });
});

describe("sign-up agreement", () => {
  it("asks for it, with links to the Terms and the Privacy Policy that open in a new tab", () => {
    page("/register", <RegisterPage />);
    const box = screen.getByRole("checkbox", { name: /I'm at least 13 years old and I agree to the Terms and the Privacy Policy/ });
    expect(box).toBeRequired();
    expect(box).not.toBeChecked();
    const terms = screen.getByRole("link", { name: "Terms" });
    expect(terms).toHaveAttribute("href", "/terms");
    expect(terms).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });
});

describe("an address that isn't a page", () => {
  it("says so and offers the way home", async () => {
    page("/old-link", <NotFoundPage />);
    expect(screen.getByRole("heading", { level: 1, name: "That page isn't here" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
    await userEvent.tab();
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,nofollow");
  });
});

describe("the site's own headers (vercel.json)", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
  const general = config.headers.find((h) => h.source.includes("(?!"));
  const value = (key: string) => general?.headers.find((h) => h.key === key)?.value;
  // a path-to-regexp pattern like "/((?!api/).*)" is, for these, the same as the regular expression after the slash
  const covers = (path: string) => new RegExp(`^${general!.source}$`).test(path);

  it("keeps the site out of other people's frames, and says what it is and what it may use", () => {
    expect(general).toBeDefined();
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    // the live audio rooms need the microphone, and nothing needs the camera
    expect(value("Permissions-Policy")).toContain("microphone=(self)");
    expect(value("Permissions-Policy")).toContain("camera=()");
  });

  it("covers every page of the site, and leaves the embed cards (made to be framed) and the API's own headers alone", () => {
    for (const path of ["/", "/u/zoe", "/posts/abc", "/profile", "/privacy", "/login", "/pieces"]) expect(covers(path), path).toBe(true);
    for (const path of ["/embed/piece/1", "/embed/profile/zoe", "/api/health", "/p/zoe", "/sitemap.xml"]) expect(covers(path), path).toBe(false);
  });
});
