import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PersonCard } from "./PersonCard";
import type { User } from "../../types";

const person = (over: Partial<User> = {}) => ({ id: "u1", username: "zoe", displayName: "Zoe", avatarUrl: null, ...over }) as User;
const show = (user: User) =>
  render(
    <MemoryRouter>
      <ul>
        <PersonCard user={user} />
      </ul>
    </MemoryRouter>
  );

describe("PersonCard", () => {
  it("shows what the person does right under their name, ahead of their mood and bio", () => {
    show(person({ headline: "Illustrator · open to commissions", mood: "calm", bio: "I draw." }));
    const headline = screen.getByText("Illustrator · open to commissions");
    expect(headline.compareDocumentPosition(screen.getByText("calm")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(headline.compareDocumentPosition(screen.getByText("I draw.")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: /Zoe/ })).toHaveAttribute("href", "/u/zoe");
  });

  it("shows no headline line when there isn't one", () => {
    show(person({ mood: "calm" }));
    expect(screen.getByText("calm")).toBeInTheDocument();
    expect(document.querySelectorAll("p")).toHaveLength(1);
  });
});
