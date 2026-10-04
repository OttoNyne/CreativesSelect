import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditBox } from "./EditBox";
import { EditedMark } from "./EditedMark";

function setup(onSave = vi.fn().mockResolvedValue(null), extra: Partial<React.ComponentProps<typeof EditBox>> = {}) {
  const onCancel = vi.fn();
  render(<EditBox text="Hello" maxText={50} label="Edit post" onSave={onSave} onCancel={onCancel} {...extra} />);
  return { onSave, onCancel };
}

describe("EditBox", () => {
  it("starts with the current words and can't be saved until something changes", () => {
    setup();
    expect(screen.getByLabelText("Edit post")).toHaveValue("Hello");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves the changed words", async () => {
    const { onSave } = setup();
    await userEvent.type(screen.getByLabelText("Edit post"), " there");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ text: "Hello there" });
  });

  it("won't save an empty box", async () => {
    const { onSave } = setup();
    await userEvent.clear(screen.getByLabelText("Edit post"));
    await userEvent.type(screen.getByLabelText("Edit post"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Write something first");
  });

  it("shows the reason when the change can't be saved, and lets them try again", async () => {
    const onSave = vi.fn().mockResolvedValue("Messages can only be changed for 15 minutes after they are sent");
    setup(onSave);
    await userEvent.type(screen.getByLabelText("Edit post"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("15 minutes");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("cancels", async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("edits a title along with the text when there is one, and needs the title", async () => {
    const { onSave } = setup(undefined, { title: "Old title", maxTitle: 20 });
    await userEvent.clear(screen.getByLabelText("Edit post: title"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Give it a title");
    await userEvent.type(screen.getByLabelText("Edit post: title"), "New title");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ text: "Hello", title: "New title" });
  });
});

describe("EditedMark", () => {
  it("says (edited) with the day when something was changed", () => {
    render(<EditedMark editedAt="2026-05-01T10:00:00.000Z" />);
    expect(screen.getByText("(edited)")).toHaveAttribute("title", expect.stringContaining("Edited"));
  });

  it("shows nothing when it never was", () => {
    const { container } = render(<EditedMark editedAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
