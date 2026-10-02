// Stand-ins for the browser's WebRTC objects (jsdom has none), so the live-audio logic can be
// tested without a real network connection.

export class FakeTrack {
  enabled = true;
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

export class FakeStream {
  tracks: FakeTrack[];
  constructor(count = 1) {
    this.tracks = Array.from({ length: count }, () => new FakeTrack());
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
  asStream() {
    return this as unknown as MediaStream;
  }
}

export class FakePeer {
  static all: FakePeer[] = [];
  static failToCreate = false;
  static reset() {
    FakePeer.all = [];
    FakePeer.failToCreate = false;
  }

  connectionState: RTCPeerConnectionState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  addedTracks: unknown[] = [];
  transceivers: { kind: string; init?: RTCRtpTransceiverInit }[] = [];
  candidates: unknown[] = [];
  closed = false;
  config: RTCConfiguration;

  onicecandidate: ((e: { candidate: unknown }) => void) | null = null;
  ontrack: ((e: { streams: unknown[]; track: unknown }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  constructor(config: RTCConfiguration) {
    if (FakePeer.failToCreate) throw new Error("WebRTC is not available");
    this.config = config;
    FakePeer.all.push(this);
  }

  addTrack(track: unknown) {
    this.addedTracks.push(track);
  }
  addTransceiver(kind: string, init?: RTCRtpTransceiverInit) {
    this.transceivers.push({ kind, init });
  }
  async createOffer() {
    return { type: "offer" as const, sdp: "fake-offer-sdp" };
  }
  async createAnswer() {
    return { type: "answer" as const, sdp: "fake-answer-sdp" };
  }
  async setLocalDescription(d: RTCSessionDescriptionInit) {
    this.localDescription = d;
  }
  async setRemoteDescription(d: RTCSessionDescriptionInit) {
    this.remoteDescription = d;
  }
  async addIceCandidate(c: unknown) {
    this.candidates.push(c);
  }
  close() {
    this.closed = true;
    this.connectionState = "closed";
  }

  /** Pretend the network changed the connection's state. */
  setState(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
  /** Pretend the browser found a network route to try. */
  gatherCandidate(candidate: unknown = { candidate: "candidate:1 1 udp 1 127.0.0.1 9 typ host" }) {
    this.onicecandidate?.({ candidate: { toJSON: () => candidate } });
  }
  /** Pretend audio started arriving. */
  receiveAudio(stream = new FakeStream()) {
    this.ontrack?.({ streams: [stream], track: stream.tracks[0] });
    return stream;
  }
}

export const makePeer = (config: RTCConfiguration) => new FakePeer(config) as unknown as RTCPeerConnection;
export const lastPeer = () => FakePeer.all[FakePeer.all.length - 1];
