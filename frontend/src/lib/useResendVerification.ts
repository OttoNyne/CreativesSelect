import { useState } from "react";
import { authApi } from "../api/auth.api";
import { ApiError } from "../api/client";

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
      setMessage("Sent — check your inbox (and spam folder).");
    } catch (err) {
      setState("error");
      setMessage(err instanceof ApiError ? err.message : "Couldn't send the email — please try again.");
    }
  }

  return { state, message, resend };
}
