import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { OffersEditor, OpenToWorkBadge, WorkRequestForm } from "./OpenToWork";
import { workRequestsApi } from "../../api/workRequests.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/workRequests.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/workRequests.api")>()),
  workRequestsApi: { send: vi.fn() },
}));
const send = vi.mocked(workRequestsApi.send);
beforeEach(() => {
  send.mockReset();
});

describe("OpenToWorkBadge", () => {
  it("shows nothing for someone who isn't open to work", () => {
    const { container } = render(<OpenToWorkBadge profile={{ openToWork: false, workOffers: ["mixing"], workNote: "hi" }} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("says they are open, what they offer and their note", () => {
    render(<OpenToWorkBadge profile={{ openToWork: true, workOffers: ["logo design", "mixing"], workNote: "Booked until March" }} />);
    expect(screen.getByText("Open to work")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "What they offer" })).toHaveTextContent("logo design");
    expect(screen.getByText("Booked until March")).toBeInTheDocument();
  });
  it("is fine with no offers and no note", () => {
    render(<OpenToWorkBadge profile={{ openToWork: true }} />);
    expect(screen.getByText("Open to work")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

function Editor({ start = [] as string[] }) {
  const [offers, setOffers] = useState(start);
  const [note, setNote] = useState("");
  return (
    <>
      <OffersEditor offers={offers} note={note} onOffers={setOffers} onNote={setNote} />
      <output data-testid="state">{JSON.stringify({ offers, note })}</output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent!);

describe("OffersEditor", () => {
  it("adds an offer with Enter or the button, tidied up, and takes it away again", async () => {
    render(<Editor />);
    await userEvent.type(screen.getByRole("textbox", { name: /What do you offer/ }), "  Logo Design {Enter}");
    await userEvent.type(screen.getByRole("textbox", { name: /What do you offer/ }), "mixing");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(state().offers).toEqual(["logo design", "mixing"]);
    await userEvent.click(screen.getByRole("button", { name: "Remove logo design" }));
    expect(state().offers).toEqual(["mixing"]);
  });
  it("won't take something that isn't a word, or one you already have", async () => {
    render(<Editor start={["mixing"]} />);
    const box = screen.getByRole("textbox", { name: /What do you offer/ });
    await userEvent.type(box, "!!");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await userEvent.clear(box);
    await userEvent.type(box, "Mixing");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(state().offers).toEqual(["mixing"]);
  });
  it("stops at five", () => {
    render(<Editor start={["aa", "bb", "cc", "dd", "ee"]} />);
    expect(screen.queryByRole("textbox", { name: /What do you offer/ })).toBeNull();
  });
  it("keeps the note", async () => {
    render(<Editor />);
    await userEvent.type(screen.getByRole("textbox", { name: /short note/ }), "Open in May");
    expect(state().note).toBe("Open in May");
  });
});

describe("WorkRequestForm", () => {
  const to = { username: "alice", displayName: "Alice" };
  async function fill(title = "A logo", details = "Warm colours") {
    await userEvent.type(screen.getByRole("textbox", { name: "Title of your request" }), title);
    await userEvent.type(screen.getByRole("textbox", { name: "Details of your request" }), details);
  }

  it("needs a title and details before it can be sent", async () => {
    render(<WorkRequestForm to={to} onSent={() => {}} onCancel={() => {}} />);
    const button = screen.getByRole("button", { name: "Send request" });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Title of your request" }), "A logo");
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Details of your request" }), "Warm colours");
    expect(button).toBeEnabled();
  });

  it("sends the brief, leaving out a budget or deadline that wasn't given, and says it is only an introduction", async () => {
    send.mockResolvedValue({ request: {} as never });
    const onSent = vi.fn();
    render(<WorkRequestForm to={to} onSent={onSent} onCancel={() => {}} />);
    expect(screen.getByText(/nothing is paid or promised/)).toBeInTheDocument();
    await fill("  A logo  ", " Warm colours ");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(send).toHaveBeenCalledWith("alice", { title: "A logo", details: "Warm colours" });
    await waitFor(() => expect(onSent).toHaveBeenCalled());
  });

  it("sends a budget and a deadline when they are given", async () => {
    send.mockResolvedValue({ request: {} as never });
    render(<WorkRequestForm to={to} onSent={() => {}} onCancel={() => {}} />);
    await fill();
    await userEvent.type(screen.getByRole("textbox", { name: "Budget" }), "around 200");
    await userEvent.type(screen.getByLabelText("Deadline (optional)"), "2999-01-01");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(send).toHaveBeenCalledWith("alice", { title: "A logo", details: "Warm colours", budget: "around 200", deadline: "2999-01-01" });
  });

  it("says why it couldn't be sent, and lets them try again", async () => {
    send.mockRejectedValue(new ApiError(409, "You already have requests waiting with them"));
    const onSent = vi.fn();
    render(<WorkRequestForm to={to} onSent={onSent} onCancel={() => {}} />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You already have requests waiting with them");
    expect(onSent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send request" })).toBeEnabled();
  });

  it("can be cancelled", async () => {
    const onCancel = vi.fn();
    render(<WorkRequestForm to={to} onSent={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
