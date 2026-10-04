import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileMood, ProfileTags } from "./ProfileStatus";

describe("ProfileMood", () => {
  it("shows the mood and what they are listening to", () => {
    render(<ProfileMood mood="feeling creative" listeningTo="Blue in Green" />);
    expect(screen.getByText("feeling creative")).toBeInTheDocument();
    expect(screen.getByText("Blue in Green")).toBeInTheDocument();
    expect(screen.getByText("Listening to:")).toHaveClass("sr-only");
  });
  it("shows just one when only one is set", () => {
    render(<ProfileMood mood="calm" />);
    expect(screen.getByRole("list", { name: "Status" }).children).toHaveLength(1);
  });
  it("renders nothing when neither is set", () => {
    const { container } = render(<ProfileMood />);
    expect(container).toBeEmptyDOMElement();
  });
  it("shows text as text, never as markup", () => {
    render(<ProfileMood mood="<img src=x onerror=alert(1)>" />);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("ProfileTags", () => {
  it("links each tag to the people who share it, encoding the tag", () => {
    render(
      <MemoryRouter>
        <ProfileTags tags={["potter", "lo-fi producer"]} />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Find others tagged potter" })).toHaveAttribute("href", "/search?tag=potter");
    expect(screen.getByRole("link", { name: "Find others tagged lo-fi producer" })).toHaveAttribute("href", "/search?tag=lo-fi%20producer");
  });
  it("renders nothing without tags", () => {
    const { container } = render(
      <MemoryRouter>
        <ProfileTags tags={[]} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
