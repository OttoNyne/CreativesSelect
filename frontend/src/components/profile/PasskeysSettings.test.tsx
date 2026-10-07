import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasskeysSettings } from "./PasskeysSettings";
import { passkeysApi, type Passkey } from "../../api/passkeys.api";
import { ApiError } from "../../api/client";
import { PasskeyError, createPasskey, passkeysSupported } from "../../lib/passkeys";

vi.mock("../../api/passkeys.api", () => ({ passkeysApi: { list: vi.fn(), registerOptions: vi.fn(), registerVerify: vi.fn(), rename: vi.fn(), remove: vi.fn() } }));
vi.mock("../../lib/passkeys", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/passkeys")>()), createPasskey: vi.fn(), passkeysSupported: vi.fn() }));
const api = vi.mocked(passkeysApi);
const create = vi.mocked(createPasskey);
const supported = vi.mocked(passkeysSupported);

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const phone: Passkey = { id: "p1", name: "My phone", createdAt: ago(3 * 86_400_000), lastUsedAt: ago(2 * 3_600_000), synced: true, backedUp: true };
const laptop: Passkey = { id: "p2", name: "Work laptop", createdAt: ago(86_400_000), lastUsedAt: null, synced: false, backedUp: false };
const listing = (passkeys: Passkey[], rpId = "localhost", max = 10) => ({ passkeys, rpId, max });

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset();
  create.mockReset();
  supported.mockReset();
  supported.mockReturnValue(true);
});

async function open() {
  await userEvent.click(screen.getByRole("button", { name: /Passkeys…/ }));
}

describe("PasskeysSettings: the list", () => {
  it("starts closed and asks the server for nothing", () => {
    render(<PasskeysSettings />);
    expect(screen.getByRole("button", { name: /Passkeys…/ })).toBeInTheDocument();
    expect(api.list).not.toHaveBeenCalled();
  });

  it("explains what a passkey is, and says when there are none", async () => {
    api.list.mockResolvedValue(listing([]));
    render(<PasskeysSettings />);
    await open();
    expect(await screen.findByText(/fingerprint, face or device PIN instead of a password/)).toBeInTheDocument();
    expect(screen.getByText(/counts as both your password and your two-step code/)).toBeInTheDocument();
    expect(screen.getByText("You haven't added any passkeys yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a passkey" })).toBeInTheDocument();
  });

  it("lists each one with when it was added and last used, and whether it is synced", async () => {
    api.list.mockResolvedValue(listing([phone, laptop]));
    render(<PasskeysSettings />);
    await open();
    const items = within(await screen.findByRole("list", { name: "Your passkeys" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("My phone");
    expect(items[0]).toHaveTextContent(/Added 3 days ago · used 2 hours ago · synced between your devices/);
    expect(items[1]).toHaveTextContent("Work laptop");
    expect(items[1]).toHaveTextContent(/never used/);
    expect(items[1]).not.toHaveTextContent(/synced/);
  });

  it("warns when this browser can't do passkeys, or the page is on the wrong address, and offers no way to add", async () => {
    supported.mockReturnValue(false);
    api.list.mockResolvedValue(listing([]));
    const { unmount } = render(<PasskeysSettings />);
    await open();
    expect(await screen.findByText(/This browser can't use passkeys/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a passkey" })).not.toBeInTheDocument();
    unmount();

    supported.mockReturnValue(true);
    api.list.mockResolvedValue(listing([], "www.example.org"));
    render(<PasskeysSettings />);
    await open();
    expect(await screen.findByText(/Passkeys work on www.example.org only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a passkey" })).not.toBeInTheDocument();
  });

  it("says when the most are held, and offers no more", async () => {
    api.list.mockResolvedValue(listing([phone, laptop], "localhost", 2));
    render(<PasskeysSettings />);
    await open();
    expect(await screen.findByText(/most passkeys allowed \(2\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a passkey" })).not.toBeInTheDocument();
  });

  it("says when the list can't be loaded, and tries again on request", async () => {
    api.list.mockRejectedValueOnce(new ApiError(500, "Internal server error")).mockResolvedValueOnce(listing([]));
    render(<PasskeysSettings />);
    await open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Internal server error");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You haven't added any passkeys yet.")).toBeInTheDocument();
  });

  it("can be closed again", async () => {
    api.list.mockResolvedValue(listing([]));
    render(<PasskeysSettings />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: /Passkeys…/ })).toBeInTheDocument();
  });
});

describe("PasskeysSettings: adding one", () => {
  async function toTheForm(passkeys: Passkey[] = []) {
    api.list.mockResolvedValue(listing(passkeys));
    render(<PasskeysSettings />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Add a passkey" }));
    await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
  }

  it("asks for the password, then the device, then saves it, and shows it in the list", async () => {
    api.registerOptions.mockResolvedValue({ challenge: "abc" } as never);
    create.mockResolvedValue({ id: "new" } as never);
    api.registerVerify.mockResolvedValue({ passkey: { ...laptop, id: "p9", name: "Kitchen tablet" } });
    await toTheForm([phone]);
    await userEvent.type(screen.getByLabelText("Name for this passkey (optional)"), "  Kitchen tablet ");
    await userEvent.click(screen.getByRole("button", { name: "Add passkey" }));

    expect(api.registerOptions).toHaveBeenCalledWith("my-password-1", undefined);
    expect(create).toHaveBeenCalledWith({ challenge: "abc" });
    expect(api.registerVerify).toHaveBeenCalledWith({ id: "new" }, "Kitchen tablet");
    expect(await screen.findByRole("status")).toHaveTextContent("Added “Kitchen tablet”");
    expect(within(screen.getByRole("list", { name: "Your passkeys" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByLabelText("Your password")).not.toBeInTheDocument(); // not kept on the page
  });

  it("sends no name when none is typed, so the server names it", async () => {
    api.registerOptions.mockResolvedValue({ challenge: "abc" } as never);
    create.mockResolvedValue({ id: "new" } as never);
    api.registerVerify.mockResolvedValue({ passkey: laptop });
    await toTheForm();
    await userEvent.click(screen.getByRole("button", { name: "Add passkey" }));
    expect(api.registerVerify).toHaveBeenCalledWith({ id: "new" }, undefined);
  });

  it("keeps the button off until the password is typed", async () => {
    api.list.mockResolvedValue(listing([]));
    render(<PasskeysSettings />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Add a passkey" }));
    expect(screen.getByRole("button", { name: "Add passkey" })).toBeDisabled();
  });

  it("shows a wrong password as the server words it, and never reaches the device", async () => {
    api.registerOptions.mockRejectedValue(new ApiError(403, "That password isn't right"));
    await toTheForm();
    await userEvent.click(screen.getByRole("button", { name: "Add passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That password isn't right");
    expect(create).not.toHaveBeenCalled();
  });

  it("asks for a code when the server says the second step is needed, then sends it", async () => {
    api.registerOptions.mockRejectedValueOnce(new ApiError(401, "Enter a code from your authenticator app (or a recovery code) to add a passkey", undefined, "second_step_needed"));
    await toTheForm();
    await userEvent.click(screen.getByRole("button", { name: "Add passkey" }));
    await userEvent.type(await screen.findByLabelText("Code from your app"), "123456");
    api.registerOptions.mockResolvedValueOnce({ challenge: "abc" } as never);
    create.mockResolvedValue({ id: "new" } as never);
    api.registerVerify.mockResolvedValue({ passkey: laptop });
    await userEvent.click(screen.getByRole("button", { name: "Add passkey" }));
    expect(api.registerOptions).toHaveBeenLastCalledWith("my-password-1", "123456");
    expect(await screen.findByRole("status")).toHaveTextContent("Added");
  });

  it("says plainly when the person closed the device prompt, and saves nothing", async () => {
    api.registerOptions.mockResolvedValue({ challenge: "abc" } as never);
    create.mockRejectedValue(new PasskeyError("cancelled", "Adding a passkey was cancelled."));
    await toTheForm();
    await userEvent.click(screen.getByRole("button", { name: "Add passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Adding a passkey was cancelled.");
    expect(api.registerVerify).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Your password")).toHaveValue("my-password-1"); // so they can try again
  });

  it("shows what the device or the server said when it can't be added", async () => {
    api.registerOptions.mockResolvedValue({ challenge: "abc" } as never);
    create.mockRejectedValueOnce(new PasskeyError("already-added", "This device already has a passkey for this account."));
    await toTheForm();
    await userEvent.click(screen.getByRole("button", { name: "Add passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already has a passkey");

    create.mockResolvedValueOnce({ id: "new" } as never);
    api.registerVerify.mockRejectedValueOnce(new ApiError(400, "That passkey didn't work. Try again, or sign in with your password."));
    await userEvent.click(screen.getByRole("button", { name: "Add passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That passkey didn't work");
  });

  it("falls back to a plain message for anything unexpected", async () => {
    api.registerOptions.mockRejectedValue(new TypeError("Failed to fetch"));
    await toTheForm();
    await userEvent.click(screen.getByRole("button", { name: "Add passkey" }));
    expect(await screen.findByText("Couldn't add the passkey, try again.")).toBeInTheDocument();
  });

  it("only asks once at a time, and Cancel puts everything away", async () => {
    api.registerOptions.mockImplementation(() => new Promise(() => {}));
    await toTheForm();
    await userEvent.click(screen.getByRole("button", { name: "Add passkey" }));
    expect(screen.getByRole("button", { name: "Waiting for your device…" })).toBeDisabled();
    expect(api.registerOptions).toHaveBeenCalledTimes(1);
  });

  it("Cancel closes the form and forgets the password", async () => {
    await toTheForm();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Add a passkey" }));
    expect(screen.getByLabelText("Your password")).toHaveValue("");
  });
});

describe("PasskeysSettings: renaming and removing", () => {
  async function toTheList() {
    api.list.mockResolvedValue(listing([phone, laptop]));
    render(<PasskeysSettings />);
    await open();
    await screen.findByRole("list", { name: "Your passkeys" });
  }

  it("renames one, starting from its current name", async () => {
    api.rename.mockResolvedValue({ passkey: { ...phone, name: "Pocket phone" } });
    await toTheList();
    await userEvent.click(screen.getByRole("button", { name: "Rename My phone" }));
    const box = screen.getByLabelText("New name");
    expect(box).toHaveValue("My phone");
    await userEvent.clear(box);
    await userEvent.type(box, "Pocket phone");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(api.rename).toHaveBeenCalledWith("p1", "Pocket phone");
    expect(await screen.findByText("Pocket phone")).toBeInTheDocument();
    expect(screen.queryByText("My phone")).not.toBeInTheDocument();
  });

  it("shows why a rename was refused and keeps the old name", async () => {
    api.rename.mockRejectedValue(new ApiError(400, "The name can be up to 40 characters"));
    await toTheList();
    await userEvent.click(screen.getByRole("button", { name: "Rename My phone" }));
    await userEvent.type(screen.getByLabelText("New name"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 40 characters");
    expect(screen.getAllByText("My phone").length).toBeGreaterThan(0);
  });

  it("removes one with the password, and takes it off the list", async () => {
    api.remove.mockResolvedValue(undefined);
    await toTheList();
    await userEvent.click(screen.getByRole("button", { name: "Remove Work laptop" }));
    const remove = screen.getByRole("button", { name: "Remove passkey" });
    expect(remove).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
    await userEvent.click(remove);
    expect(api.remove).toHaveBeenCalledWith("p2", "my-password-1");
    expect(await screen.findByRole("status")).toHaveTextContent("Removed “Work laptop”");
    expect(within(screen.getByRole("list", { name: "Your passkeys" })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows a wrong password when removing and keeps the passkey", async () => {
    api.remove.mockRejectedValue(new ApiError(403, "That password isn't right"));
    await toTheList();
    await userEvent.click(screen.getByRole("button", { name: "Remove Work laptop" }));
    await userEvent.type(screen.getByLabelText("Your password"), "wrong-wrong");
    await userEvent.click(screen.getByRole("button", { name: "Remove passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That password isn't right");
    expect(screen.getByText("Work laptop")).toBeInTheDocument();
  });

  it("refreshes the list when the passkey had already gone", async () => {
    api.remove.mockRejectedValue(new ApiError(404, "That passkey wasn't found"));
    await toTheList();
    api.list.mockResolvedValue(listing([phone]));
    await userEvent.click(screen.getByRole("button", { name: "Remove Work laptop" }));
    await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Remove passkey" }));
    await screen.findByText("My phone");
    expect(screen.queryByText("Work laptop")).not.toBeInTheDocument();
  });

  it("offers one change at a time, and Cancel goes back", async () => {
    await toTheList();
    await userEvent.click(screen.getByRole("button", { name: "Remove My phone" }));
    expect(screen.queryByRole("button", { name: "Rename Work laptop" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Rename Work laptop" })).toBeInTheDocument();
  });
});
