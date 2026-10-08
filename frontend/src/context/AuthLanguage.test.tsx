import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { AuthProvider } from "./AuthContext";
import { authApi } from "../api/auth.api";
import { profilesApi } from "../api/profiles.api";
import { initI18n } from "../i18n";
import type { User } from "../types";

vi.mock("../api/auth.api", () => ({ authApi: { me: vi.fn(), register: vi.fn() } }));
vi.mock("../api/profiles.api", () => ({ profilesApi: { updateMe: vi.fn() } }));

const me = vi.mocked(authApi.me);
const updateMe = vi.mocked(profilesApi.updateMe);
const person = (language?: User["language"]) => ({ id: "u1", username: "zoe", displayName: "Zoe", ...(language ? { language } : {}) }) as User;

beforeEach(() => {
  me.mockReset();
  updateMe.mockReset();
  updateMe.mockResolvedValue({ user: person() });
});
afterEach(async () => {
  await initI18n("en");
});

describe("the language the site emails someone in", () => {
  it("is told when the page is in another language than the account's", async () => {
    await initI18n("ar");
    me.mockResolvedValue({ user: person("en") });
    render(<AuthProvider>{null}</AuthProvider>);
    await waitFor(() => expect(updateMe).toHaveBeenCalledWith({ language: "ar" }));
  });

  it("is left alone when they already match, or when the account doesn't say", async () => {
    await initI18n("es");
    me.mockResolvedValue({ user: person("es") });
    const first = render(<AuthProvider>{null}</AuthProvider>);
    await waitFor(() => expect(me).toHaveBeenCalledTimes(1));
    first.unmount();
    me.mockResolvedValue({ user: person() });
    render(<AuthProvider>{null}</AuthProvider>);
    await waitFor(() => expect(me).toHaveBeenCalledTimes(2));
    expect(updateMe).not.toHaveBeenCalled();
  });

  it("never gets in the way if telling the account fails", async () => {
    await initI18n("ar");
    updateMe.mockRejectedValue(new Error("offline"));
    me.mockResolvedValue({ user: person("en") });
    render(<AuthProvider>{null}</AuthProvider>);
    await waitFor(() => expect(updateMe).toHaveBeenCalled());
  });
});
