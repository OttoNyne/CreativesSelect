import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { liveApi } from "../api/live.api";
import { API_BASE } from "../api/base";
import { ApiError } from "../api/client";
import { Avatar } from "../components/common/Avatar";
import { LiveChat } from "../components/live/LiveChat";
import { LiveHost } from "../lib/live/host";
import { LiveListener, type ListenerState } from "../lib/live/listener";
import { liveAudioSupported, UNSUPPORTED_MESSAGE } from "../lib/live/rtc";
import { clearStreamFor, getStreamFor, MIC_CONSTRAINTS, micErrorMessage } from "../lib/live/hostStream";
import type { LiveRoom } from "../types";

function Header({ room, listening }: { room: LiveRoom; listening: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <Avatar username={room.host.username} displayName={room.host.displayName} avatarUrl={room.host.avatarUrl} size={48} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold text-white">{room.title}</h1>
        <p className="text-sm text-white/60">
          <Link to={`/u/${room.host.username}`} className="hover:underline">
            {room.isHost ? "You" : room.host.displayName}
          </Link>{" "}
          · <span aria-live="polite">{listening} listening</span>
        </p>
      </div>
      <span className="rounded bg-red-600 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">Live</span>
    </div>
  );
}

function Ended({ message = "This live has ended." }: { message?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
      <p role="status" className="text-white">
        {message}
      </p>
      <Link to="/live" className="mt-3 inline-block text-sm text-violet-400 hover:underline">
        Back to live
      </Link>
    </div>
  );
}

// ---- The person broadcasting -------------------------------------------------
function HostRoom({ room }: { room: LiveRoom }) {
  const id = room.id;
  const navigate = useNavigate();
  const [stream, setStream] = useState<MediaStream | null>(() => getStreamFor(id));
  const [micError, setMicError] = useState<string | null>(null);
  const [listeners, setListeners] = useState(room.listenerCount);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState(false);
  const hostRef = useRef<LiveHost | null>(null);
  const teardown = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!stream) return;
    if (teardown.current) {
      clearTimeout(teardown.current);
      teardown.current = null;
    }
    if (!hostRef.current) {
      const host = new LiveHost({
        liveId: id,
        stream,
        api: liveApi,
        onListenerCount: setListeners,
        onEnded: () => {
          hostRef.current = null;
          clearStreamFor(id);
          setEnded(true);
        },
      });
      hostRef.current = host;
      host.start();
    }
    return () => {
      // Leaving the page ends the live and closes the microphone, so it can never keep
      // broadcasting out of sight. (Deferred a moment so React re-running this effect in
      // development doesn't end it.)
      teardown.current = setTimeout(() => {
        if (!hostRef.current) return;
        hostRef.current.stop();
        hostRef.current = null;
        clearStreamFor(id);
        void liveApi.end(id).catch(() => {});
      }, 150);
    };
  }, [stream, id]);

  // Closing the tab or navigating away from the site also ends it right away.
  useEffect(() => {
    const onHide = () => {
      fetch(`${API_BASE}/api/live/${id}/end`, { method: "POST", credentials: "include", keepalive: true }).catch(() => {});
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [id]);

  async function handleResume() {
    setMicError(null);
    try {
      setStream(await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS));
    } catch (err) {
      setMicError(micErrorMessage(err));
    }
  }

  function toggleMute() {
    const next = !muted;
    hostRef.current?.setMuted(next);
    setMuted(next);
  }

  async function handleEnd() {
    if (!window.confirm("End your live for everyone?")) return;
    hostRef.current?.stop();
    hostRef.current = null;
    clearStreamFor(id);
    await liveApi.end(id).catch(() => {});
    navigate("/live");
  }

  if (ended) return <Ended message="Your live has ended." />;

  return (
    <div className="space-y-4">
      <Header room={room} listening={listeners} />
      {stream ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p role="status" className="text-sm text-white/80">
            {muted ? "Your microphone is muted — listeners can't hear you." : "You're live — listeners can hear your microphone."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={toggleMute} aria-pressed={muted} className="rounded-md border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10">
              {muted ? "Unmute microphone" : "Mute microphone"}
            </button>
            <button onClick={handleEnd} className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
              End live
            </button>
          </div>
          <p className="mt-3 text-xs text-white/40">
            Up to {room.maxListeners} people can listen. Leaving this page, or closing the tab, ends your live and turns your microphone off.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-white/80">Your microphone isn&apos;t on, so no one can hear you. Allow it to carry on with this live.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={handleResume} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
              Allow microphone
            </button>
            <button onClick={handleEnd} className="rounded-md border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10">
              End live
            </button>
          </div>
          {micError && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {micError}
            </p>
          )}
        </div>
      )}
      <LiveChat liveId={id} isHost open />
    </div>
  );
}

// ---- Someone listening -------------------------------------------------------
const STATE_TEXT: Record<Exclude<ListenerState, "ended" | "failed">, string> = {
  connecting: "Connecting…",
  live: "Listening live",
  reconnecting: "Reconnecting…",
};

function ListenerRoom({ room }: { room: LiveRoom }) {
  const navigate = useNavigate();
  const [state, setState] = useState<ListenerState | "idle">(room.status === "ended" ? "ended" : "idle");
  const [count, setCount] = useState(room.listenerCount);
  const [error, setError] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [muted, setMuted] = useState(false);
  // True once the server has let us in; the chat opens then, not the moment Listen is tapped.
  const [admitted, setAdmitted] = useState(false);
  const listenerRef = useRef<LiveListener | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    return () => {
      void listenerRef.current?.leave();
    };
  }, []);

  function playAudio() {
    audioRef.current
      ?.play()
      .then(() => setNeedsTap(false))
      .catch(() => setNeedsTap(true));
  }

  async function handleListen() {
    setError(null);
    setState("connecting");
    const listener = new LiveListener({
      liveId: room.id,
      hostId: room.host.id,
      api: liveApi,
      onState: setState,
      onListenerCount: setCount,
      onJoined: () => setAdmitted(true),
      onStream: (stream) => {
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          playAudio();
        }
      },
    });
    listenerRef.current = listener;
    try {
      await listener.start();
    } catch (err) {
      listenerRef.current = null;
      setAdmitted(false);
      setState("idle");
      setError(err instanceof ApiError ? err.message : "Couldn't join this live.");
    }
  }

  async function handleLeave() {
    await listenerRef.current?.leave();
    listenerRef.current = null;
    setAdmitted(false);
    navigate("/live");
  }

  function toggleMute() {
    const next = !muted;
    if (audioRef.current) audioRef.current.muted = next;
    setMuted(next);
  }

  const joined = state !== "idle" && state !== "ended";
  const supported = liveAudioSupported();
  const full = count >= room.maxListeners && state === "idle";

  return (
    <div className="space-y-4">
      <Header room={room} listening={count} />
      {/* playsInline + autoplay lets the audio start inside the page on iPhones */}
      <audio ref={audioRef} autoPlay playsInline />
      {state === "ended" ? (
        <Ended />
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          {state === "idle" ? (
            <>
              <p className="text-sm text-white/70">Tap to start listening. You&apos;ll hear the host, and you can chat along.</p>
              {!supported && (
                <p role="alert" className="mt-2 text-sm text-red-400">
                  {UNSUPPORTED_MESSAGE}
                </p>
              )}
              <button
                onClick={handleListen}
                disabled={full || !supported}
                className="mt-3 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {full ? "This live is full" : "Listen"}
              </button>
            </>
          ) : state === "failed" ? (
            <>
              <p role="alert" className="text-sm text-red-400">
                Couldn&apos;t connect the audio. Your network may be blocking live audio.
              </p>
              <button
                onClick={() => void listenerRef.current?.retry()}
                className="mt-3 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
              >
                Try again
              </button>
            </>
          ) : (
            <p role="status" className="text-sm text-white/80">
              {STATE_TEXT[state as keyof typeof STATE_TEXT]}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          )}
          {needsTap && (
            <button onClick={playAudio} className="mt-3 block rounded-md border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10">
              Tap to play audio
            </button>
          )}
          {joined && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={toggleMute} aria-pressed={muted} className="rounded-md border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10">
                {muted ? "Unmute" : "Mute"}
              </button>
              <button onClick={handleLeave} className="rounded-md border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10">
                Leave
              </button>
            </div>
          )}
        </div>
      )}
      {state !== "ended" && <LiveChat liveId={room.id} isHost={false} open={joined && admitted} />}
    </div>
  );
}

export function LiveRoomPage() {
  const { id = "" } = useParams();
  const [room, setRoom] = useState<LiveRoom | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setRoom(null);
    liveApi
      .get(id)
      .then(({ live }) => {
        if (cancelled) return;
        setRoom(live);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError && err.status === 404 ? "This live isn't available." : "Couldn't load this live.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {status === "loading" && <p className="p-8 text-center text-white/40">Loading…</p>}
      {status === "error" && <Ended message={error ?? "This live isn't available."} />}
      {status === "ready" && room && (room.isHost ? room.status === "live" ? <HostRoom key={room.id} room={room} /> : <Ended message="Your live has ended." /> : <ListenerRoom key={room.id} room={room} />)}
    </div>
  );
}
