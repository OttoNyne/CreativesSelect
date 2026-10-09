import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Linkified } from "./Linkified";

describe("Linkified", () => {
  it("makes @names into links to those people's profiles, keeping the words around them", () => {
    render(
      <MemoryRouter>
        <p data-testid="t">
          <Linkified text="Thanks @sam_1 and @Lee, see you!" />
        </p>
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "@sam_1" })).toHaveAttribute("href", "/u/sam_1");
    expect(screen.getByRole("link", { name: "@Lee" })).toHaveAttribute("href", "/u/Lee");
    expect(screen.getByTestId("t")).toHaveTextContent("Thanks @sam_1 and @Lee, see you!");
  });
  it("still makes web addresses into links, and a mention beside one", () => {
    render(
      <MemoryRouter>
        <Linkified text="@sam see https://example.com/page" />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "@sam" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "example.com/page" })).toHaveAttribute("target", "_blank");
  });
  it("leaves email addresses and glued names as text", () => {
    render(
      <MemoryRouter>
        <Linkified text="write to sam@example.com or hi@bob" />
      </MemoryRouter>
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("works where there is no router around, with an ordinary link", () => {
    render(<Linkified text="hello @sam" />);
    expect(screen.getByRole("link", { name: "@sam" })).toHaveAttribute("href", "/u/sam");
  });
  it("draws a name as text, never markup, and can be given another link style", () => {
    render(
      <MemoryRouter>
        <Linkified text="<b>@sam</b>" linkClassName="text-white" />
      </MemoryRouter>
    );
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByRole("link", { name: "@sam" })).toHaveClass("text-white");
  });
});

describe("Linkified: hashtags", () => {
  it("makes #hashtags into links to the topic on Explore", () => {
    render(
      <MemoryRouter>
        <p data-testid="t">
          <Linkified text="Throwing #Pots today, see #glaze_tips" />
        </p>
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "#Pots" })).toHaveAttribute("href", "/explore?tag=pots");
    expect(screen.getByRole("link", { name: "#glaze_tips" })).toHaveAttribute("href", "/explore?tag=glaze_tips");
    expect(screen.getByTestId("t")).toHaveTextContent("Throwing #Pots today, see #glaze_tips");
  });
  it("leaves '#12' and glued '#' as text, and works without a router", () => {
    render(<Linkified text="issue #12 and page#top and #real" />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "#real" })).toHaveAttribute("href", "/explore?tag=real");
  });
});
