import { useState } from "react";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";
import { t } from "../i18n";

// Asks for another "confirm your email" link and keeps track of what to tell the person.
export function useResendVerification() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    if (state === "sending") return;
    setState("sending");
    setMessage(null);
    try {
      await authApi.resendVerification();
      setState("sent");
      setMessage(t("verify.sent"));
    } catch (err) {
      setState("error");
      setMessage(err instanceof ApiError ? err.message : t("verify.sendFailed"));
    }
  }

  return { state, message, resend };
}
