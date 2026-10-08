import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MentionInput, MentionTextarea } from "./MentionField";
import { mentionsApi, type MentionPerson } from "../../api/mentions.api";

vi.mock("../../api/mentions.api", () => ({ mentionsApi: { suggest: vi.fn() } }));
const suggest = vi.mocked(mentionsApi.suggest);
const person = (username: string, isFriend = false): MentionPerson => ({ id: `id-${username}`, username, displayName: username.toUpperCase(), avatarUrl: null, isFriend });

function Box({ kind = "textarea", onKey }: { kind?: "textarea" | "input"; onKey?: (key: string) => void }) {
  const [text, setText] = useState("");
  const common = { "aria-label": "Write", value: text, onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setText(e.target.value), onKeyDown: (e: React.KeyboardEvent) => onKey?.(e.key) };
  return kind === "textarea" ? <MentionTextarea {...(common as object)} /> : <MentionInput {...(common as object)} />;
}
const box = () => screen.getByRole("textbox", { name: "Write" }) as HTMLTextAreaElement | HTMLInputElement;

beforeEach(() => {
  suggest.mockReset();
  suggest.mockImplementation(async (q) => ({ people: [person("sandra", true), person("sabrina")].filter((p) => p.username.startsWith(q)) }));
});

describe("MentionField", () => {
  it("is an ordinary field until an @ is typed, and asks for nobody", async () => {
    render(<Box />);
    await userEvent.type(box(), "hello there");
    expect(box()).toHaveValue("hello there");
    expect(suggest).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("offers people after an @, narrowing as more is typed, friends marked", async () => {
    render(<Box />);
    await userEvent.type(box(), "hi @sa");
    const list = await screen.findByRole("listbox", { name: "People you can mention" });
    expect(list).toBeInTheDocument();
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("option", { name: /SANDRA/ })).toHaveTextContent("Friend");
    await userEvent.type(box(), "n");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(suggest).toHaveBeenLastCalledWith("san");
  });

  it("puts the chosen person in with a click, as plain text, and closes the list", async () => {
    render(<Box />);
    await userEvent.type(box(), "hi @sa");
    await userEvent.click(await screen.findByRole("option", { name: /SABRINA/ }));
    expect(box()).toHaveValue("hi @sabrina ");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box()).toHaveFocus();
  });

  it("works from the keyboard: arrows move, Enter chooses, and Enter does not reach the field's own handler while the list is open", async () => {
    const keys: string[] = [];
    render(<Box onKey={(k) => keys.push(k)} />);
    await userEvent.type(box(), "@sa");
    await screen.findAllByRole("option");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true"); // wraps round
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    const before = keys.length;
    await userEvent.keyboard("{Enter}");
    expect(box()).toHaveValue("@sabrina ");
    expect(keys.slice(before)).not.toContain("Enter");
  });

  it("closes with Escape and keeps what was typed, and Enter then belongs to the field again", async () => {
    const keys: string[] = [];
    render(<Box kind="input" onKey={(k) => keys.push(k)} />);
    await userEvent.type(box(), "@sa");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box()).toHaveValue("@sa");
    await userEvent.keyboard("{Enter}");
    expect(keys.at(-1)).toBe("Enter");
  });

  it("works the same in an input", async () => {
    render(<Box kind="input" />);
    await userEvent.type(box(), "thanks @sa");
    await userEvent.click(await screen.findByRole("option", { name: /SANDRA/ }));
    expect(box()).toHaveValue("thanks @sandra ");
  });

  it("puts the name in the middle of the text where the caret is", async () => {
    render(<Box />);
    await userEvent.type(box(), "ask  please");
    await userEvent.type(box(), "@sa", { initialSelectionStart: 4, initialSelectionEnd: 4, skipClick: true });
    await userEvent.click(await screen.findByRole("option", { name: /SANDRA/ }));
    expect(box()).toHaveValue("ask @sandra please");
  });

  it("offers nobody inside an email address, and shows no list when nobody matches or the lookup fails", async () => {
    render(<Box />);
    await userEvent.type(box(), "sam@exa");
    expect(suggest).not.toHaveBeenCalled();
    await userEvent.clear(box());
    suggest.mockResolvedValue({ people: [] });
    await userEvent.type(box(), "@zz");
    await waitFor(() => expect(suggest).toHaveBeenCalled());
    expect(screen.queryByRole("listbox")).toBeNull();
    suggest.mockRejectedValue(new Error("down"));
    await userEvent.type(box(), "z");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("describes itself to assistive technology as offering a list, naming the active person while it is open", async () => {
    render(<Box />);
    expect(box()).toHaveAttribute("aria-autocomplete", "list");
    expect(box()).not.toHaveAttribute("aria-activedescendant");
    await userEvent.type(box(), "@sa");
    await screen.findAllByRole("option");
    expect(box().getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[0].id);
    expect(box().getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
  });
});
