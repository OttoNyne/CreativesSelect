import { afterEach, describe, expect, it, vi } from "vitest";
import { passkeysApi } from "./passkeys.api";

afterEach(() => vi.unstubAllGlobals());

describe("passkeysApi", () => {
  it("uses the right addresses and bodies, and puts nothing in an address that belongs in a body", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchFn);
    const registration = { id: "a", rawId: "a", type: "public-key", response: {}, clientExtensionResults: {} } as never;
    await passkeysApi.list();
    await passkeysApi.registerOptions("my-password");
    await passkeysApi.registerOptions("my-password", "123456");
    await passkeysApi.registerVerify(registration);
    await passkeysApi.registerVerify(registration, "My phone");
    await passkeysApi.rename("abc/123", "New name");
    await passkeysApi.remove("abc/123", "my-password");
    await passkeysApi.loginOptions();
    await passkeysApi.loginVerify(registration);
    const calls = fetchFn.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace(/^.*\/api/, "")}${init?.body ? ` ${init.body}` : ""}`);
    const response = '{"id":"a","rawId":"a","type":"public-key","response":{},"clientExtensionResults":{}}';
    expect(calls).toEqual([
      "GET /auth/passkeys",
      'POST /auth/passkeys/register/options {"password":"my-password"}',
      'POST /auth/passkeys/register/options {"password":"my-password","code":"123456"}',
      `POST /auth/passkeys/register/verify {"response":${response}}`,
      `POST /auth/passkeys/register/verify {"response":${response},"name":"My phone"}`,
      'PATCH /auth/passkeys/abc%2F123 {"name":"New name"}',
      'DELETE /auth/passkeys/abc%2F123 {"password":"my-password"}',
      "POST /auth/passkeys/login/options {}",
      `POST /auth/passkeys/login/verify {"response":${response}}`,
    ]);
  });
});
