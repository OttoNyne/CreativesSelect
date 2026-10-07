import { beforeEach, describe, expect, it, vi } from "vitest";
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { PasskeyError, createPasskey, passkeysSupported, signInWithPasskey } from "./passkeys";

vi.mock("@simplewebauthn/browser", () => ({ startRegistration: vi.fn(), startAuthentication: vi.fn(), browserSupportsWebAuthn: vi.fn() }));
const register = vi.mocked(startRegistration);
const authenticate = vi.mocked(startAuthentication);

const options = { challenge: "abc" } as never;
const fail = (name: string, code?: string) => Object.assign(new Error("browser says no"), { name, code });

beforeEach(() => {
  register.mockReset();
  authenticate.mockReset();
});

describe("passkeysSupported", () => {
  it("is what the browser says", () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(true);
    expect(passkeysSupported()).toBe(true);
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false);
    expect(passkeysSupported()).toBe(false);
  });
});

describe("createPasskey", () => {
  it("hands the options to the device and returns its answer", async () => {
    register.mockResolvedValue({ id: "key" } as never);
    await expect(createPasskey(options)).resolves.toEqual({ id: "key" });
    expect(register).toHaveBeenCalledWith({ optionsJSON: options });
  });

  it("treats closing the prompt as a cancellation, not a failure", async () => {
    register.mockRejectedValue(fail("NotAllowedError"));
    await expect(createPasskey(options)).rejects.toMatchObject({ reason: "cancelled", message: "Adding a passkey was cancelled." });
    register.mockRejectedValue(fail("Error", "ERROR_CEREMONY_ABORTED"));
    await expect(createPasskey(options)).rejects.toMatchObject({ reason: "cancelled" });
  });

  it("says when this device already has a passkey for the account", async () => {
    register.mockRejectedValue(fail("InvalidStateError", "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"));
    await expect(createPasskey(options)).rejects.toMatchObject({ reason: "already-added", message: expect.stringMatching(/already has a passkey/) });
  });

  it("says when the device can't make the kind of passkey the site needs", async () => {
    register.mockRejectedValue(fail("Error", "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT"));
    await expect(createPasskey(options)).rejects.toMatchObject({ reason: "no-support", message: expect.stringMatching(/fingerprint, face or PIN/) });
    register.mockRejectedValue(fail("NotSupportedError"));
    await expect(createPasskey(options)).rejects.toMatchObject({ reason: "no-support" });
  });

  it("says when the page is on the wrong address", async () => {
    register.mockRejectedValue(fail("SecurityError"));
    await expect(createPasskey(options)).rejects.toMatchObject({ reason: "other", message: expect.stringMatching(/main address/) });
    register.mockRejectedValue(fail("Error", "ERROR_INVALID_RP_ID"));
    await expect(createPasskey(options)).rejects.toMatchObject({ message: expect.stringMatching(/main address/) });
  });

  it("uses a plain message for anything else, never the browser's own text", async () => {
    register.mockRejectedValue(new Error("Some internal browser detail"));
    const err = await createPasskey(options).catch((e) => e);
    expect(err).toBeInstanceOf(PasskeyError);
    expect(err.message).toBe("Couldn't add the passkey. Try again.");
    expect(err.message).not.toContain("internal");
  });
});

describe("signInWithPasskey", () => {
  it("hands the options to the device and returns its answer", async () => {
    authenticate.mockResolvedValue({ id: "key" } as never);
    await expect(signInWithPasskey(options)).resolves.toEqual({ id: "key" });
    expect(authenticate).toHaveBeenCalledWith({ optionsJSON: options });
  });

  it("says closing the prompt was a cancellation, and words the others for signing in", async () => {
    authenticate.mockRejectedValue(fail("NotAllowedError"));
    await expect(signInWithPasskey(options)).rejects.toMatchObject({ reason: "cancelled", message: "Signing in with a passkey was cancelled." });
    authenticate.mockRejectedValue(new Error("boom"));
    await expect(signInWithPasskey(options)).rejects.toMatchObject({ reason: "other", message: "Couldn't sign in with a passkey. Try again, or use your password." });
  });
});
