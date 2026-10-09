import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DigestSettings } from "./DigestSettings";
import { DigestUnsubscribePage } from "../../pages/DigestUnsubscribePage";
import { digestApi } from "../../api/topics.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/topics.api", () => ({ digestApi: { get: vi.fn(), set: vi.fn(), unsubscribe: vi.fn() }, topicsApi: {} }));
const api = vi.mocked(digestApi);

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.get.mockResolvedValue({ enabled: false, emailVerified: true });
});

describe("DigestSettings", () => {
  it("is off to begin with, and turns on and off", async () => {
    api.set.mockResolvedValueOnce({ enabled: true, emailVerified: true }).mockResolvedValueOnce({ enabled: false, emailVerified: true });
    render(<DigestSettings />);
    const box = await screen.findByRole("checkbox", { name: "Email me a short summary once a week" });
    await screen.findByText(/Nothing is sent when there is nothing to say/);
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(api.set).toHaveBeenLastCalledWith(true);
    expect(await screen.findByRole("checkbox", { name: "Email me a short summary once a week" })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Email me a short summary once a week" }));
    expect(api.set).toHaveBeenLastCalledWith(false);
  });

  it("says when the address is not confirmed yet, since summaries only go to confirmed ones", async () => {
    api.get.mockResolvedValue({ enabled: true, emailVerified: false });
    render(<DigestSettings />);
    expect(await screen.findByText(/Confirm your email address first/)).toBeInTheDocument();
  });

  it("says why it couldn't be changed", async () => {
    api.set.mockRejectedValue(new ApiError(429, "You've changed that a lot — try again later."));
    render(<DigestSettings />);
    await userEvent.click(await screen.findByRole("checkbox"));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed that a lot");
  });
});

describe("DigestUnsubscribePage", () => {
  const show = (hash: string) =>
    render(
      <MemoryRouter initialEntries={[`/digest/unsubscribe${hash}`]}>
        <Routes>
          <Route path="/digest/unsubscribe" element={<DigestUnsubscribePage />} />
        </Routes>
      </MemoryRouter>
    );

  it("turns the summary off with the token in the address, and says so", async () => {
    api.unsubscribe.mockResolvedValue({ enabled: false });
    show("#token=abc.def.ghi");
    expect(await screen.findByText("Done. You won't get the weekly summary any more.")).toBeInTheDocument();
    expect(api.unsubscribe).toHaveBeenCalledWith("abc.def.ghi");
    expect(api.unsubscribe).toHaveBeenCalledTimes(1);
    expect(screen.getByText("You can turn it back on in your profile settings.")).toBeInTheDocument();
  });

  it("says when the link is no good, or has no token at all", async () => {
    api.unsubscribe.mockRejectedValue(new ApiError(400, "That link isn't valid any more"));
    show("#token=bad");
    expect(await screen.findByRole("alert")).toHaveTextContent("That link isn't valid any more");
    expect(screen.getByRole("link", { name: "Go to CreativesSelect" })).toHaveAttribute("href", "/");
  });

  it("does not try with nothing to try", async () => {
    show("");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(api.unsubscribe).not.toHaveBeenCalled();
  });
});
