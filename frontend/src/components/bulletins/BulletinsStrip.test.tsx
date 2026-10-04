import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BulletinsStrip } from "./BulletinsStrip";
import { bulletinsApi, BULLETINS_CHANGED_EVENT } from "../../api/bulletins.api";
import { ApiError } from "../../api/client";

vi.mock("../../api/bulletins.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/bulletins.api")>()),
  bulletinsApi: { unreadCount: vi.fn() },
}));
const unreadCount = vi.mocked(bulletinsApi.unreadCount);

const renderIt = () =>
  render(
    <MemoryRouter>
      <BulletinsStrip />
    </MemoryRouter>
  );

beforeEach(() => {
  unreadCount.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("BulletinsStrip", () => {
  it("leads to the bulletin board", async () => {
    unreadCount.mockResolvedValue({ unread: 0 });
    renderIt();
    expect(await screen.findByRole("link", { name: /Bulletins/ })).toHaveAttribute("href", "/bulletins");
    expect(screen.queryByLabelText(/new$/)).not.toBeInTheDocument();
  });

  it("shows how many new bulletins there are", async () => {
    unreadCount.mockResolvedValue({ unread: 3 });
    renderIt();
    expect(await screen.findByLabelText("3 new")).toHaveTextContent("3 new");
  });

  it("caps a big number", async () => {
    unreadCount.mockResolvedValue({ unread: 250 });
    renderIt();
    expect(await screen.findByLabelText("250 new")).toHaveTextContent("99+ new");
  });

  it("keeps the last count when it can't ask", async () => {
    unreadCount.mockResolvedValueOnce({ unread: 2 });
    unreadCount.mockRejectedValue(new ApiError(500, "boom"));
    renderIt();
    expect(await screen.findByLabelText("2 new")).toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new Event(BULLETINS_CHANGED_EVENT));
    });
    expect(screen.getByLabelText("2 new")).toBeInTheDocument();
  });

  it("refreshes when the board has been looked at", async () => {
    unreadCount.mockResolvedValueOnce({ unread: 2 });
    unreadCount.mockResolvedValue({ unread: 0 });
    renderIt();
    expect(await screen.findByLabelText("2 new")).toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new Event(BULLETINS_CHANGED_EVENT));
    });
    expect(screen.queryByLabelText("2 new")).not.toBeInTheDocument();
  });

  it("asks again every minute", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    unreadCount.mockResolvedValue({ unread: 0 });
    renderIt();
    await screen.findByRole("link", { name: /Bulletins/ });
    expect(unreadCount).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(unreadCount).toHaveBeenCalledTimes(2);
  });
});
