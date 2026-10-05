import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Highlight } from "./Highlight";

const marked = (container: HTMLElement) => [...container.querySelectorAll("mark")].map((m) => m.textContent);

describe("Highlight", () => {
  it("marks every place a word appears, in any case, and keeps the text as it was written", () => {
    const { container } = render(<Highlight text="Kiln notes: the KILN and a kiln." words={["kiln"]} />);
    expect(marked(container)).toEqual(["Kiln", "KILN", "kiln"]);
    expect(container.textContent).toBe("Kiln notes: the KILN and a kiln.");
  });

  it("marks each of several words, the longer one first so it isn't cut short", () => {
    const { container } = render(<Highlight text="Glazes and glazed pots" words={["glaze", "glazed"]} />);
    expect(marked(container)).toEqual(["Glaze", "glazed"]);
  });

  it("treats a word as plain text, not a pattern", () => {
    const { container } = render(<Highlight text="a.b and axb and (x+)" words={["a.b", "(x+)"]} />);
    expect(marked(container)).toEqual(["a.b", "(x+)"]);
  });

  it("draws text as text, never as markup", () => {
    const { container } = render(<Highlight text={'<img src=x onerror="alert(1)"> kiln'} words={["kiln"]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img");
    expect(marked(container)).toEqual(["kiln"]);
  });

  it("shows the text alone when there is nothing to mark", () => {
    const { container } = render(<Highlight text="Plain" words={[]} />);
    expect(container.textContent).toBe("Plain");
    expect(container.querySelector("mark")).toBeNull();
    expect(render(<Highlight text="" words={["a"]} />).container.textContent).toBe("");
  });
});
