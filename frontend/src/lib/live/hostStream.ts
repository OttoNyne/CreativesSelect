import { t } from "../../i18n";
// Hands the microphone stream from the "Go live" button (where the browser's permission
// prompt must be triggered by a tap) to the live room page that is opened next.
let pending: { liveId: string; stream: MediaStream } | null = null;

export function holdStreamFor(liveId: string, stream: MediaStream) {
  pending?.stream.getTracks().forEach((t) => t.stop());
  pending = { liveId, stream };
}

// Looks without removing (React may run an effect twice in development); call clearStreamFor when the live is over.
export function getStreamFor(liveId: string): MediaStream | null {
  return pending?.liveId === liveId ? pending.stream : null;
}

export function clearStreamFor(liveId: string) {
  if (pending?.liveId === liveId) pending = null;
}

export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: false,
};

export function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return t("libmsg.microphoneAccessWasBlocked");
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return t("libmsg.noMicrophoneWasFound");
  if (name === "NotReadableError") return t("libmsg.yourMicrophoneIsIn");
  return t("live.couldntStartYourMicrophone");
}
