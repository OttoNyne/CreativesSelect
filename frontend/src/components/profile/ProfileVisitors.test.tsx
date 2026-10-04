import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileVisitors } from "./ProfileVisitors";
import { profileViewsApi } from "../../api/profileViews.api";
import { ApiError } from "../../api/client";
import type { User } from "../../types";

vi.mock("../../api/profileViews.api", () => ({ profileViewsApi: { list: vi.fn(), record: vi.fn() } }));
const list = vi.mocked(profileViewsApi.list);

const ada = { id: "u1", username: "ada", displayName: "Ada" } as User;
const kai = { id: "u2", username: "kai", displayName: "Kai" } as User;

const renderIt = () =>
  render(
    <MemoryRouter>
      <ProfileVisitors />
    </MemoryRouter>
  );

beforeEach(() => {
  list.mockReset();
});

describe("ProfileVisitors", () => {
  it("lists who visited, each linking to their profile, with the day", async () => {
    list.mockResolvedValue({ visitors: [{ user: ada, day: "2026-10-04" }, { user: kai, day: "2026-09-30" }] });
    renderIt();
    expect(await screen.findByRole("link", { name: "Ada" })).toHaveAttribute("href", "/u/ada");
    expect(screen.getByText("Visited October 4, 2026")).toBeInTheDocument();
    expect(screen.getByText("Visited September 30, 2026")).toBeInTheDocument();
    expect(screen.getByText(/Only you can see this/)).toBeInTheDocument();
  });

  it("says when there are none yet", async () => {
    list.mockResolvedValue({ visitors: [] });
    renderIt();
    expect(await screen.findByText("No visitors to show yet.")).toBeInTheDocument();
  });

  it("shows nothing while loading, and nothing at all if it can't be read (for example, switched off)", async () => {
    list.mockRejectedValue(new ApiError(403, "Turn on profile views to see who visits your profile"));
    const { container } = renderIt();
    expect(container).toBeEmptyDOMElement();
    await vi.waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Recent visitors" })).not.toBeInTheDocument();
  });
});
