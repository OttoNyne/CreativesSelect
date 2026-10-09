import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../api/base";

// Live updates: one connection to the server (server-sent events) over which it says "something new" the moment it happens. What comes down
// it is only a hint with nothing private in it ("a notification", "a message in your chat with sam"); the page then asks the ordinary
// endpoints for the real thing. If the connection can't be made or breaks, the page's own polling carries on at its old, faster pace, so the
// worst case is how it behaved before.

type Data = Record<string, unknown>;
type Handler = (data: Data) => void;

const EVENT_TYPES = ["notification", "message", "typing", "project"] as const;
const RETRY_LATER_MS = 30_000;

class LiveUpdates {
  private source: EventSource | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private listeners = new Set<(connected: boolean) => void>();
  private retry: ReturnType<typeof setTimeout> | null = null;
  private connected = false;

  isConnected() {
    return this.connected;
  }

  /** Calls `handler` each time the server sends this kind of hint. Opens the connection for the first one, closes it after the last. */
  subscribe(type: string, handler: Handler): () => void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler);
    this.handlers.set(type, set);
    this.open();
    return () => {
      set.delete(handler);
      if (this.size() === 0) this.close();
    };
  }

  /** Calls `listener` when the connection comes up or goes down. */
  onConnection(listener: (connected: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private size() {
    let n = 0;
    for (const set of this.handlers.values()) n += set.size;
    return n;
  }

  private setConnected(value: boolean) {
    if (this.connected === value) return;
    this.connected = value;
    for (const listener of [...this.listeners]) listener(value);
  }

  private open() {
    if (this.source || this.retry || typeof EventSource === "undefined") return;
    const source = new EventSource(`${API_BASE}/api/updates/stream`, { withCredentials: true });
    this.source = source;
    source.onopen = () => this.setConnected(true);
    source.onerror = () => {
      this.setConnected(false);
      // The browser reconnects by itself after a dropped connection. If the server refused (not signed in, too many connections) it gives up
      // for good, so try again later instead; polling covers the gap.
      if (source.readyState === EventSource.CLOSED) {
        this.source = null;
        this.later();
      }
    };
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (event) => {
        let data: Data = {};
        try {
          data = JSON.parse((event as MessageEvent).data) as Data;
        } catch {
          // a hint with nothing readable in it still means "look again"
        }
        for (const handler of [...(this.handlers.get(type) ?? [])]) handler(data);
      });
    }
    // The server ends each connection after a few minutes (and says so), and when this sign-in stops counting.
    source.addEventListener("reconnect", () => {
      this.drop();
      this.open();
    });
    source.addEventListener("signed-out", () => {
      this.drop();
      this.later();
    });
  }

  private later() {
    if (this.retry || this.size() === 0) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.size() > 0) this.open();
    }, RETRY_LATER_MS);
  }

  private drop() {
    this.source?.close();
    this.source = null;
    this.setConnected(false);
  }

  private close() {
    this.drop();
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
  }
}

export const liveUpdates = new LiveUpdates();

/**
 * Keeps something fresh: runs `reload` when the server says this kind of thing happened, when the connection comes back (to catch what was
 * missed), and on a timer that is slow while the connection is up and fast while it isn't. `reload` gets the hint's contents when it was
 * the server that asked.
 */
export function useLiveRefresh(type: "notification" | "message", reload: (hint?: Data) => void, fastMs: number, slowMs: number) {
  const latest = useRef(reload);
  useEffect(() => {
    latest.current = reload;
  });
  const [live, setLive] = useState(() => liveUpdates.isConnected());

  useEffect(() => {
    const stopHints = liveUpdates.subscribe(type, (data) => latest.current(data));
    const stopConnection = liveUpdates.onConnection((connected) => {
      setLive(connected);
      if (connected) latest.current();
    });
    return () => {
      stopHints();
      stopConnection();
    };
  }, [type]);

  useEffect(() => {
    const timer = setInterval(() => latest.current(), live ? slowMs : fastMs);
    return () => clearInterval(timer);
  }, [live, fastMs, slowMs]);
}
