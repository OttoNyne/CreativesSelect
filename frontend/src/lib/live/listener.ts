import { ApiError } from "../../api/client";
import type { LiveApi, LiveSignal } from "../../api/live.api";
import { createPeer, describe, describeCandidate, loadIceServers, newConnectionId, Poller, type PeerFactory } from "./rtc";

export type ListenerState = "connecting" | "live" | "reconnecting" | "failed" | "ended";

export interface LiveListenerOptions {
  liveId: string;
  hostId: string;
  api: Pick<LiveApi, "join" | "leave" | "signals" | "sendSignal" | "heartbeat" | "iceServers">;
  onState: (state: ListenerState) => void;
  onStream: (stream: MediaStream) => void;
  onListenerCount?: (count: number) => void;
  /** Called once the server has accepted us into the room (before the audio connects). */
  onJoined?: () => void;
  createPeer?: PeerFactory;
  signalPollMs?: number;
  heartbeatMs?: number;
  /** How long one attempt may take to connect before it's retried. */
  attemptTimeoutMs?: number;
  /** How long a dropped connection is given to recover on its own. */
  disconnectGraceMs?: number;
  maxAttempts?: number;
}

/**
 * A listener's side: join the room, offer to receive the host's audio, and keep that
 * connection going (retrying a few times if it drops or never comes up).
 */
export class LiveListener {
  private readonly opts: LiveListenerOptions;
  private pc: RTCPeerConnection | null = null;
  private cid = "";
  private cursor: string | undefined;
  private pendingIce: RTCIceCandidateInit[] = [];
  private remoteSet = false;
  private attempts = 0;
  private stopped = false;
  private attemptTimer: ReturnType<typeof setTimeout> | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private iceServers: RTCIceServer[] | null = null;
  private readonly signalPoller: Poller;
  private readonly heartbeatPoller: Poller;

  constructor(opts: LiveListenerOptions) {
    this.opts = opts;
    this.signalPoller = new Poller(() => this.pollSignals(), opts.signalPollMs ?? 1000);
    this.heartbeatPoller = new Poller(() => this.beat(), opts.heartbeatMs ?? 10_000);
  }

  /** Joins the room (throws the API's error if it's full or over) and starts connecting. */
  async start() {
    await this.opts.api.join(this.opts.liveId);
    this.opts.onJoined?.();
    this.iceServers = await loadIceServers(this.opts.api);
    this.heartbeatPoller.start();
    await this.connect();
  }

  /** Leaves the room and stops everything. */
  async leave() {
    if (this.stopped) return;
    this.teardown();
    await this.opts.api.leave(this.opts.liveId).catch(() => {});
  }

  /** Tries again after a failure. */
  async retry() {
    if (this.stopped) return;
    this.attempts = 0;
    await this.connect();
  }

  private teardown() {
    this.stopped = true;
    this.signalPoller.stop();
    this.heartbeatPoller.stop();
    this.clearTimers();
    this.pc?.close();
    this.pc = null;
  }

  private clearTimers() {
    if (this.attemptTimer) clearTimeout(this.attemptTimer);
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.attemptTimer = this.graceTimer = null;
  }

  private ended() {
    if (this.stopped) return;
    this.teardown();
    this.opts.onState("ended");
  }

  private async beat() {
    try {
      const { status, listenerCount } = await this.opts.api.heartbeat(this.opts.liveId);
      this.opts.onListenerCount?.(listenerCount);
      if (status === "ended") this.ended();
    } catch (err) {
      // not in the room any more (it ended, or we were blocked): nothing left to listen to
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) this.ended();
    }
  }

  private async connect() {
    if (this.stopped) return;
    this.clearTimers();
    this.pc?.close();
    this.attempts++;
    this.opts.onState(this.attempts > 1 ? "reconnecting" : "connecting");

    const { liveId, hostId, api } = this.opts;
    const cid = (this.cid = newConnectionId());
    this.remoteSet = false;
    this.pendingIce = [];
    let pc: RTCPeerConnection;
    try {
      pc = this.pc = (this.opts.createPeer ?? createPeer)({ iceServers: this.iceServers ?? [] });
      pc.addTransceiver("audio", { direction: "recvonly" });
    } catch {
      // this browser can't set up a connection at all: nothing more to try
      this.opts.onState("failed");
      return;
    }
    pc.ontrack = (e) => this.opts.onStream(e.streams[0] ?? new MediaStream([e.track]));
    pc.onicecandidate = (e) => {
      if (e.candidate && this.pc === pc) {
        void api.sendSignal(liveId, { to: hostId, kind: "ice", data: { cid, candidate: describeCandidate(e.candidate) } }).catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc || this.stopped) return;
      if (pc.connectionState === "connected") {
        // The handshake is done: stop asking for handshake messages (it saves the server a request a
        // second per listener). A reconnect starts polling again.
        this.signalPoller.stop();
        this.clearTimers();
        this.attempts = 0;
        this.opts.onState("live");
      } else if (pc.connectionState === "disconnected") {
        // often a blip that heals itself; give it a few seconds before starting over
        this.opts.onState("reconnecting");
        this.graceTimer ??= setTimeout(() => void this.recover(), this.opts.disconnectGraceMs ?? 5000);
      } else if (pc.connectionState === "failed") {
        void this.recover();
      }
    };
    this.signalPoller.start();
    this.attemptTimer = setTimeout(() => {
      if (this.pc === pc && pc.connectionState !== "connected") void this.recover();
    }, this.opts.attemptTimeoutMs ?? 20_000);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await api.sendSignal(liveId, { to: hostId, kind: "offer", data: { cid, sdp: describe(pc.localDescription) } });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) return this.ended();
      void this.recover();
    }
  }

  private async recover() {
    if (this.stopped) return;
    this.clearTimers();
    if (this.attempts >= (this.opts.maxAttempts ?? 3)) {
      this.pc?.close();
      this.opts.onState("failed");
      return;
    }
    await this.connect();
  }

  private async pollSignals() {
    if (this.stopped) return;
    const { signals } = await this.opts.api.signals(this.opts.liveId, this.cursor);
    for (const signal of signals) {
      if (this.stopped) return;
      this.cursor = signal.id;
      await this.handle(signal).catch(() => {});
    }
  }

  private async handle(signal: LiveSignal) {
    const pc = this.pc;
    // Anything from an earlier connection attempt is ignored.
    if (!pc || signal.data?.cid !== this.cid) return;
    if (signal.kind === "answer" && signal.data.sdp) {
      await pc.setRemoteDescription(signal.data.sdp);
      this.remoteSet = true;
      for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    } else if (signal.kind === "ice" && signal.data.candidate) {
      if (this.remoteSet) await pc.addIceCandidate(signal.data.candidate).catch(() => {});
      else this.pendingIce.push(signal.data.candidate); // the host's candidates can beat its answer here
    }
  }
}
