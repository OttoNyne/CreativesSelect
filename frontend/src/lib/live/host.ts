import { ApiError } from "../../api/client";
import type { LiveApi, LiveSignal } from "../../api/live.api";
import { createPeer, describe, describeCandidate, loadIceServers, Poller, type PeerFactory } from "./rtc";

export interface LiveHostOptions {
  liveId: string;
  stream: MediaStream;
  api: Pick<LiveApi, "signals" | "sendSignal" | "heartbeat" | "iceServers">;
  onListenerCount?: (count: number) => void;
  onEnded?: () => void;
  createPeer?: PeerFactory;
  signalPollMs?: number;
  heartbeatMs?: number;
}

interface Peer {
  pc: RTCPeerConnection;
  cid: string;
}

/**
 * The broadcaster's side. Each listener sends an offer; we answer it, attaching the host's
 * microphone, and trade ICE candidates. One RTCPeerConnection per listener, so the host
 * uploads a copy of the audio to each (which is why rooms are capped).
 */
export class LiveHost {
  private readonly opts: LiveHostOptions;
  private readonly peers = new Map<string, Peer>();
  private cursor: string | undefined;
  private iceServers: RTCIceServer[] | null = null;
  private stopped = false;
  private readonly signalPoller: Poller;
  private readonly heartbeatPoller: Poller;

  constructor(opts: LiveHostOptions) {
    this.opts = opts;
    this.signalPoller = new Poller(() => this.pollSignals(), opts.signalPollMs ?? 1000);
    this.heartbeatPoller = new Poller(() => this.beat(), opts.heartbeatMs ?? 10_000);
  }

  start() {
    this.signalPoller.start();
    this.heartbeatPoller.start();
  }

  /** Mutes or unmutes the broadcast (the mic stays open, the audio goes silent). */
  setMuted(muted: boolean) {
    this.opts.stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  get connectedListeners() {
    return [...this.peers.values()].filter((p) => p.pc.connectionState === "connected").length;
  }

  stop() {
    this.stopped = true;
    this.signalPoller.stop();
    this.heartbeatPoller.stop();
    this.peers.forEach((p) => p.pc.close());
    this.peers.clear();
    this.opts.stream.getTracks().forEach((t) => t.stop());
  }

  private async beat() {
    try {
      const { status, listenerCount } = await this.opts.api.heartbeat(this.opts.liveId);
      this.opts.onListenerCount?.(listenerCount);
      if (status === "ended") this.finish();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) this.finish();
      // anything else (offline, server waking up): keep going and try again
    }
  }

  private finish() {
    if (this.stopped) return;
    this.stop();
    this.opts.onEnded?.();
  }

  private async pollSignals() {
    if (this.stopped) return;
    const { signals } = await this.opts.api.signals(this.opts.liveId, this.cursor);
    // Handled one at a time, in order: an ICE candidate must not overtake the offer before it.
    for (const signal of signals) {
      if (this.stopped) return;
      this.cursor = signal.id;
      await this.handle(signal).catch(() => {});
    }
  }

  private async handle(signal: LiveSignal) {
    if (signal.kind === "offer") return this.answer(signal);
    if (signal.kind === "ice") {
      const peer = this.peers.get(signal.from);
      if (peer && peer.cid === signal.data?.cid && signal.data.candidate) {
        await peer.pc.addIceCandidate(signal.data.candidate).catch(() => {});
      }
    }
  }

  private async answer(signal: LiveSignal) {
    const { liveId, stream, api } = this.opts;
    const listener = signal.from;
    const cid: string = signal.data?.cid;
    if (!cid || !signal.data?.sdp) return;

    // A listener reconnecting sends a fresh offer: drop the old connection first.
    this.peers.get(listener)?.pc.close();
    this.iceServers ??= await loadIceServers(api);
    const pc = (this.opts.createPeer ?? createPeer)({ iceServers: this.iceServers });
    const peer: Peer = { pc, cid };
    this.peers.set(listener, peer);

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.onicecandidate = (e) => {
      if (e.candidate && this.peers.get(listener) === peer) {
        void api.sendSignal(liveId, { to: listener, kind: "ice", data: { cid, candidate: describeCandidate(e.candidate) } }).catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        if (this.peers.get(listener) === peer) this.peers.delete(listener);
        pc.close();
      }
    };

    await pc.setRemoteDescription(signal.data.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await api.sendSignal(liveId, { to: listener, kind: "answer", data: { cid, sdp: describe(pc.localDescription) } });
  }
}
