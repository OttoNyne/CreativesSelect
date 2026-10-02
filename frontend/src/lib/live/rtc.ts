import type { LiveApi } from "../../api/live.api";

export type PeerFactory = (config: RTCConfiguration) => RTCPeerConnection;

// Live audio needs WebRTC. Some browsers (and embedded web views) don't have it.
export const liveAudioSupported = () => typeof RTCPeerConnection !== "undefined";
export const UNSUPPORTED_MESSAGE = "This browser can't play live audio. Try a recent Chrome, Edge, Firefox or Safari.";

export const createPeer: PeerFactory = (config) => new RTCPeerConnection(config);

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

// The STUN/TURN servers the API tells us to use; public STUN if it can't be asked.
export async function loadIceServers(api: Pick<LiveApi, "iceServers">): Promise<RTCIceServer[]> {
  try {
    const { iceServers } = await api.iceServers();
    return iceServers?.length ? iceServers : FALLBACK_ICE;
  } catch {
    return FALLBACK_ICE;
  }
}

// A random id for one connection attempt, so late messages from an earlier attempt are ignored.
export const newConnectionId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// What can go over the wire (the browser's own objects aren't plain data).
export const describe = (d: RTCSessionDescriptionInit | null) => (d ? { type: d.type, sdp: d.sdp } : null);
export const describeCandidate = (c: RTCIceCandidate) => (typeof c.toJSON === "function" ? c.toJSON() : c);

/**
 * Polls `tick` on a timer without ever running two at once (a slow request must not pile up
 * behind the next tick) and without overlapping after `stop()`.
 */
export class Poller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly tick: () => Promise<void>;
  private readonly everyMs: number;

  constructor(tick: () => Promise<void>, everyMs: number) {
    this.tick = tick;
    this.everyMs = everyMs;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.run(), this.everyMs);
    void this.run();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.tick();
    } catch {
      // a failed poll just tries again next time
    } finally {
      this.running = false;
    }
  }
}
