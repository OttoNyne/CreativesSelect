import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ImageAdjuster } from "./ImageAdjuster";
import { DEFAULT_FRAMING, type ImageFraming } from "../../lib/framing";

// Holds the framing in state the way the composer does, and records every change.
function setup(initial: ImageFraming = DEFAULT_FRAMING) {
  const changes: ImageFraming[] = [];
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <ImageAdjuster
        src="https://cdn.example.com/p.jpg"
        value={value}
        onChange={(next) => {
          changes.push(next);
          setValue(next);
        }}
      />
    );
  }
  render(<Harness />);
  return changes;
}
const range = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const preview = () => screen.getByTestId("adjust-preview");
const img = () => preview().querySelector("img") as HTMLImageElement;

describe("ImageAdjuster", () => {
  it("starts unframed: original shape, no zoom, and the position sliders switched off with a hint", () => {
    setup();
    expect(screen.getByRole("button", { name: "Original" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Zoom")).toHaveValue("1");
    expect(screen.getByLabelText("Move left or right")).toBeDisabled();
    expect(screen.getByLabelText("Move up or down")).toBeDisabled();
    expect(screen.getByText(/Pick a shape or zoom in/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("changes the shape, and shows it in the preview", async () => {
    const changes = setup();
    await userEvent.click(screen.getByRole("button", { name: "Square" }));
    expect(changes.at(-1)?.aspect).toBe("1:1");
    expect(screen.getByRole("button", { name: "Square" })).toHaveAttribute("aria-pressed", "true");
    expect(img().parentElement!.style.aspectRatio).toBe("1 / 1");
    await userEvent.click(screen.getByRole("button", { name: "Wide" }));
    expect(img().parentElement!.style.aspectRatio).toBe("16 / 9");
    await userEvent.click(screen.getByRole("button", { name: "4:3" }));
    expect(img().parentElement!.style.aspectRatio).toBe("4 / 3");
  });

  it("zooms, and turns the position sliders on once zoomed in", () => {
    const changes = setup();
    range("Zoom", "2");
    expect(changes.at(-1)?.zoom).toBe(2);
    expect(img().style.transform).toBe("scale(2)");
    expect(screen.getByLabelText("Move left or right")).toBeEnabled();
    expect(screen.getByText(/Drag the picture/)).toBeInTheDocument();
  });

  it("keeps zoom within 1 to 3 times", () => {
    const changes = setup();
    range("Zoom", "9");
    expect(changes.at(-1)?.zoom).toBe(3);
    range("Zoom", "0.2");
    expect(changes.at(-1)?.zoom).toBe(1);
  });

  it("moves the picture with the sliders and shows the position", () => {
    const changes = setup({ aspect: "1:1", zoom: 1, position: "50% 50%" });
    range("Move left or right", "10");
    expect(changes.at(-1)?.position).toBe("10% 50%");
    range("Move up or down", "90");
    expect(changes.at(-1)?.position).toBe("10% 90%");
    expect(img().style.objectPosition).toBe("10% 90%");
  });

  it("lets you drag the picture: dragging right shows more of its left side", () => {
    const changes = setup({ aspect: "1:1", zoom: 2, position: "50% 50%" });
    const frame = preview();
    frame.getBoundingClientRect = () => ({ width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} });
    fireEvent.pointerDown(frame, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(frame, { clientX: 140, clientY: 80, pointerId: 1 }); // right 40px, up 20px
    expect(changes.at(-1)?.position).toBe("30% 60%");
    fireEvent.pointerUp(frame, { pointerId: 1 });
    fireEvent.pointerMove(frame, { clientX: 10, clientY: 10, pointerId: 1 }); // no longer dragging
    expect(changes.at(-1)?.position).toBe("30% 60%");
  });

  it("keeps a drag inside the picture", () => {
    const changes = setup({ aspect: "1:1", zoom: 2, position: "50% 50%" });
    const frame = preview();
    frame.getBoundingClientRect = () => ({ width: 100, height: 100, left: 0, top: 0, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} });
    fireEvent.pointerDown(frame, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(frame, { clientX: 500, clientY: -500, pointerId: 1 });
    expect(changes.at(-1)?.position).toBe("0% 100%");
  });

  it("ignores dragging when there's nothing to move (original shape, not zoomed)", () => {
    const changes = setup();
    fireEvent.pointerDown(preview(), { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(preview(), { clientX: 90, clientY: 90, pointerId: 1 });
    expect(changes).toHaveLength(0);
  });

  it("resets everything", async () => {
    const changes = setup({ aspect: "16:9", zoom: 2.5, position: "10% 10%" });
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(changes.at(-1)).toEqual(DEFAULT_FRAMING);
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("copes with a position it can't read by falling back to the middle", () => {
    setup({ aspect: "1:1", zoom: 1, position: "nonsense" });
    expect(screen.getByLabelText("Move left or right")).toHaveValue("50");
  });

  it("never calls back on its own", () => {
    const spy = vi.fn();
    render(<ImageAdjuster src="x" value={DEFAULT_FRAMING} onChange={spy} />);
    expect(spy).not.toHaveBeenCalled();
  });
});
