import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

/** A problem with the device step of a passkey, in words a person can act on. */
export class PasskeyError extends Error {
  /** "cancelled" is not really a problem: the person closed the prompt. */
  reason: "cancelled" | "already-added" | "no-support" | "other";
  constructor(reason: PasskeyError["reason"], message: string) {
    super(message);
    this.reason = reason;
  }
}

/** Whether this browser can do passkeys at all. */
export const passkeysSupported = (): boolean => browserSupportsWebAuthn();

function explain(err: unknown, doing: "add" | "sign in"): PasskeyError {
  const name = (err as { name?: string })?.name;
  const code = (err as { code?: string })?.code;
  // the person closed the prompt, or it timed out
  if (name === "NotAllowedError" || code === "ERROR_CEREMONY_ABORTED" || name === "AbortError") {
    return new PasskeyError("cancelled", doing === "add" ? "Adding a passkey was cancelled." : "Signing in with a passkey was cancelled.");
  }
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" || name === "InvalidStateError") {
    return new PasskeyError("already-added", "This device already has a passkey for this account.");
  }
  if (code === "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT" || code === "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT" || name === "NotSupportedError") {
    return new PasskeyError("no-support", "This device can't make a passkey that is unlocked with a fingerprint, face or PIN. Try another device or password manager.");
  }
  if (code === "ERROR_INVALID_DOMAIN" || code === "ERROR_INVALID_RP_ID" || name === "SecurityError") {
    return new PasskeyError("other", "Passkeys only work on the site's main address. Open it there and try again.");
  }
  return new PasskeyError("other", doing === "add" ? "Couldn't add the passkey. Try again." : "Couldn't sign in with a passkey. Try again, or use your password.");
}

/** Asks the device to make a passkey, from the options the server gave. */
export async function createPasskey(options: PublicKeyCredentialCreationOptionsJSON) {
  try {
    return await startRegistration({ optionsJSON: options });
  } catch (err) {
    throw explain(err, "add");
  }
}

/** Asks the device to sign in with whichever passkey it holds for this site. */
export async function signInWithPasskey(options: PublicKeyCredentialRequestOptionsJSON) {
  try {
    return await startAuthentication({ optionsJSON: options });
  } catch (err) {
    throw explain(err, "sign in");
  }
}
