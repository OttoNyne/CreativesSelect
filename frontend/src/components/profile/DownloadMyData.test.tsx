import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DownloadMyData } from "./DownloadMyData";
import { profilesApi } from "../../api/profiles.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/profiles.api", () => ({ profilesApi: { exportData: vi.fn() } }));
const exportData = vi.mocked(profilesApi.exportData);

beforeEach(() => {
  exportData.mockReset();
});

async function open() {
  await userEvent.click(screen.getByRole("button", { name: /Download my data…/ }));
}

describe("DownloadMyData", () => {
  it("starts closed and asks the server for nothing", () => {
    render(<DownloadMyData />);
    expect(screen.getByRole("button", { name: /Download my data…/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Your password")).not.toBeInTheDocument();
    expect(exportData).not.toHaveBeenCalled();
  });

  it("says what is in the file and what isn't, before asking for anything", async () => {
    render(<DownloadMyData />);
    await open();
    expect(screen.getByText(/everything you have written or chosen here/)).toBeInTheDocument();
    expect(screen.getByText(/Other people's words to you are theirs/)).toBeInTheDocument();
    expect(screen.getByText(/password, two-step codes, sign-ins/)).toBeInTheDocument();
    expect(screen.getByText(/includes your email and private messages you sent/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });

  it("sends the password and saves the file under the name the server gave", async () => {
    const blob = new Blob(["{}"], { type: "application/json" });
    exportData.mockResolvedValue({ blob, filename: "creativesselect-zoe-2026-10-07.json" });
    const made: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      made.push(b as Blob);
      return "blob:data";
    });
    URL.revokeObjectURL = vi.fn();
    let downloadName = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download;
    });
    render(<DownloadMyData />);
    await open();
    await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Download" }));

    expect(exportData).toHaveBeenCalledWith("my-password-1");
    expect(await screen.findByRole("status")).toHaveTextContent("Saved as creativesselect-zoe-2026-10-07.json.");
    expect(click).toHaveBeenCalled();
    expect(downloadName).toBe("creativesselect-zoe-2026-10-07.json");
    expect(made).toEqual([blob]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:data");
    expect(screen.getByLabelText("Your password")).toHaveValue(""); // not kept on the page
    click.mockRestore();
  });

  it("shows a wrong password and saves nothing", async () => {
    exportData.mockRejectedValue(new ApiError(403, "Incorrect password"));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<DownloadMyData />);
    await open();
    await userEvent.type(screen.getByLabelText("Your password"), "nope-nope");
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect password");
    expect(click).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    click.mockRestore();
  });

  it("shows the limit message when asked too often, and a plain one for anything unexpected", async () => {
    exportData.mockRejectedValueOnce(new ApiError(429, "You've already downloaded your data a few times this hour — please try again later."));
    render(<DownloadMyData />);
    await open();
    await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("a few times this hour");

    exportData.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByText("Couldn't prepare your data, try again.")).toBeInTheDocument();
  });

  it("only asks once at a time", async () => {
    exportData.mockImplementation(() => new Promise(() => {}));
    render(<DownloadMyData />);
    await open();
    await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(screen.getByRole("button", { name: "Preparing…" })).toBeDisabled();
    expect(exportData).toHaveBeenCalledTimes(1);
  });

  it("closes again, forgetting the password", async () => {
    render(<DownloadMyData />);
    await open();
    await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await open();
    expect(screen.getByLabelText("Your password")).toHaveValue("");
  });
});
