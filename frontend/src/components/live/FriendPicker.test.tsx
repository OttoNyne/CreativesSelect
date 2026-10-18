import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { FriendPicker } from "./FriendPicker";
import { friendsApi } from "../../api/friends.api";
import { ApiError } from "../../api/client";
import type { User } from "../../types";

vi.mock("../../api/friends.api", () => ({ friendsApi: { list: vi.fn() } }));
const api = vi.mocked(friendsApi);
const person = (id: string, name: string) => ({ id, username: id, displayName: name, avatarUrl: null }) as User;

function Harness({ max, onChange }: { max?: number; onChange?: (ids: string[]) => void }) {
  const [ids, setIds] = useState<string[]>([]);
  return (
    <FriendPicker
      selected={ids}
      max={max}
      onChange={(next) => {
        setIds(next);
        onChange?.(next);
      }}
    />
  );
}

beforeEach(() => api.list.mockReset());

describe("FriendPicker", () => {
  it("lists your friends with a checkbox each, and counts the ones picked", async () => {
    const user = userEvent.setup();
    api.list.mockResolvedValue({ friends: [person("a", "Ann"), person("b", "Ben")] });
    const changed = vi.fn();
    render(<Harness onChange={changed} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await user.click(await screen.findByRole("checkbox", { name: /Ann/ }));
    expect(changed).toHaveBeenLastCalledWith(["a"]);
    expect(screen.getByText("1 friend invited")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Ben/ }));
    expect(screen.getByText("2 friends invited")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Ann/ }));
    expect(changed).toHaveBeenLastCalledWith(["b"]);
  });

  it("stops at the most that can be invited", async () => {
    const user = userEvent.setup();
    api.list.mockResolvedValue({ friends: [person("a", "Ann"), person("b", "Ben")] });
    const changed = vi.fn();
    render(<Harness max={1} onChange={changed} />);
    await user.click(await screen.findByRole("checkbox", { name: /Ann/ }));
    await user.click(screen.getByRole("checkbox", { name: /Ben/ }));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: /Ben/ })).not.toBeChecked();
  });

  it("says so when there is nobody to invite yet", async () => {
    api.list.mockResolvedValue({ friends: [] });
    render(<Harness />);
    expect(await screen.findByText(/You have no friends to invite yet/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("says what went wrong when the friends can't be loaded", async () => {
    api.list.mockRejectedValueOnce(new ApiError(500, "Broken")).mockRejectedValueOnce(new Error("offline"));
    const first = render(<Harness />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Broken");
    first.unmount();
    render(<Harness />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your friends, try again.");
  });
});
