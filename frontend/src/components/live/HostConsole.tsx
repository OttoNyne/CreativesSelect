import { useRef, useState } from "react";
import { liveApi } from "../../api/live.api";
import { ApiError } from "../../api/client";
import { useIsWideScreen } from "../../lib/useMediaQuery";
import type { HostConnection, MicrophoneState } from "../../lib/live/sfuHost";
import type { LiveRoom, LiveStage, User } from "../../types";
import { ConnectionDetails } from "./ConnectionDetails";
import { LiveChat } from "./LiveChat";
import { HostStage } from "./StagePanel";
import { StageTiles } from "./StageTiles";

export interface HostConsoleProps {
  room: LiveRoom;
  /** Null for a live without a stage (browser-to-browser) or until the stage has loaded. */
  stage: LiveStage | null;
  onStageChange: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
  phoneOnline: boolean;
  connection: HostConnection;
  failure: string | null;
  mic: MicrophoneState;
  details: string[];
  /** User ids the media server hears speaking right now. */
  speaking: string[];
}

const button = "rounded-md border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10";

function Notices({ phoneOnline, connection, failure, mic }: Pick<HostConsoleProps, "phoneOnline" | "connection" | "failure" | "mic">) {
  return (
    <>
      {!phoneOnline && (
        <p role="alert" className="mt-3 text-sm text-amber-300">
          Your phone has lost its internet connection, so listeners can&apos;t hear you. The live will pick up again by itself when it is back; stay on this page.
        </p>
      )}
      {phoneOnline && !failure && connection === "reconnecting" && (
        <p role="status" className="mt-3 text-sm text-amber-300">
          Your connection dropped — reconnecting. Listeners may hear a short gap. Stay on this page.
        </p>
      )}
      {!failure && mic !== "ok" && (
        <p role="alert" className="mt-3 text-sm text-amber-300">
          {mic === "ended"
            ? "Your phone has stopped the microphone, so listeners can't hear you. Another app may have taken it. End this live and start again."
            : "Your phone has paused the microphone, so listeners can't hear you right now. Keep this page open with the screen on (it pauses when the screen locks or you switch apps)."}
        </p>
      )}
      {failure && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {/[.!?]$/.test(failure) ? failure : `${failure}.`} Listeners can&apos;t hear you — end this live and start a new one to try again.
        </p>
      )}
    </>
  );
}

function Footer({ room, details, failure, connection, mic, phoneOnline }: Pick<HostConsoleProps, "room" | "details" | "failure" | "connection" | "mic" | "phoneOnline">) {
  return (
    <>
      <ConnectionDetails lines={details} open={Boolean(failure) || connection === "reconnecting" || mic !== "ok" || !phoneOnline} />
      <p className="mt-3 text-xs text-white/60">
        Up to {room.maxListeners} people can listen. Leaving this page, or closing the tab, ends your live and turns your microphone off.
      </p>
    </>
  );
}

/** The status line, and the Mute and End live buttons. */
function Controls({ muted, onToggleMute, onEnd }: Pick<HostConsoleProps, "muted" | "onToggleMute" | "onEnd">) {
  return (
    <>
      <p role="status" className="text-sm text-white/80">
        {muted ? "Your microphone is muted — listeners can't hear you." : "You're live — listeners can hear your microphone."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onToggleMute} aria-pressed={muted} className={button}>
          {muted ? "Unmute microphone" : "Mute microphone"}
        </button>
        <button onClick={onEnd} className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
          End live
        </button>
      </div>
    </>
  );
}

const card = "rounded-xl border border-white/10 bg-white/[0.03] p-4";

// ---- Wide screens: the stage as tiles on the left; who is listening and the chat on the right ------------------------
function WideLayout(props: HostConsoleProps & { stage: LiveStage }) {
  const { room, stage, onStageChange, speaking, muted } = props;
  const listeners = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(user: User) {
    setError(null);
    try {
      await liveApi.removeGuest(room.id, user.id);
      onStageChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work — please try again.");
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <section aria-label="Stage" className={card}>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">On stage</h2>
            <span className="text-xs text-white/60" aria-live="polite">
              {stage.guests.length + (stage.invited?.length ?? 0)} of {stage.maxGuests} guest places used
            </span>
          </div>
          <StageTiles
            host={room.host}
            hostMuted={muted}
            guests={stage.guests}
            invited={stage.invited ?? []}
            maxGuests={stage.maxGuests}
            speaking={speaking}
            onRemove={remove}
            onFindListeners={() => listeners.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" })}
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          )}
          <p className="mt-3 text-xs text-white/60">Use headphones while guests are on stage so their voices don&apos;t echo back.</p>
        </section>

        {((stage.requests?.length ?? 0) > 0 || (stage.invited?.length ?? 0) > 0) && (
          <HostStage liveId={room.id} stage={stage} onChange={onStageChange} sections={["requests", "invited"]} heading={false} label="Asking to speak" />
        )}

        <section aria-label="Your live" className={card}>
          <Controls muted={props.muted} onToggleMute={props.onToggleMute} onEnd={props.onEnd} />
          <Notices phoneOnline={props.phoneOnline} connection={props.connection} failure={props.failure} mic={props.mic} />
          <Footer room={room} details={props.details} failure={props.failure} connection={props.connection} mic={props.mic} phoneOnline={props.phoneOnline} />
        </section>
      </div>

      <div className="space-y-4">
        <div ref={listeners} tabIndex={-1}>
          <HostStage liveId={room.id} stage={stage} onChange={onStageChange} sections={["listeners"]} heading={false} label="Listeners" />
        </div>
        <LiveChat liveId={room.id} isHost open pollMs={room.commentPollMs} />
      </div>
    </div>
  );
}

// ---- Phones: the controls always in view, and a tab each for the stage, the listeners and the chat ---------------------
type Tab = "stage" | "listeners" | "chat";

function PhoneLayout(props: HostConsoleProps & { stage: LiveStage }) {
  const { room, stage, onStageChange } = props;
  const [tab, setTab] = useState<Tab>("stage");
  const [unread, setUnread] = useState(0);
  const requests = stage.requests?.length ?? 0;
  const listeners = stage.listeners?.length ?? 0;

  const pick = (next: Tab) => {
    setTab(next);
    if (next === "chat") setUnread(0);
  };
  const tabs: { id: Tab; label: string; badge: number }[] = [
    { id: "stage", label: "Stage", badge: tab === "stage" ? 0 : requests },
    { id: "listeners", label: "Listeners", badge: 0 },
    { id: "chat", label: "Chat", badge: tab === "chat" ? 0 : unread },
  ];

  return (
    <div className="space-y-3">
      <section aria-label="Your live" className={card}>
        <Controls muted={props.muted} onToggleMute={props.onToggleMute} onEnd={props.onEnd} />
        <Notices phoneOnline={props.phoneOnline} connection={props.connection} failure={props.failure} mic={props.mic} />
      </section>

      <div role="tablist" aria-label="Live screen" className="flex border-b border-white/10">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => pick(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-sm ${
              tab === t.id ? "border-white font-medium text-white" : "border-transparent text-white/70 hover:text-white"
            }`}
          >
            {t.label}
            {t.id === "listeners" && <span className="text-xs text-white/60">({listeners})</span>}
            {t.badge > 0 && (
              <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-black" aria-label={`${t.badge} new`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-stage" aria-labelledby="tab-stage" hidden={tab !== "stage"} className="space-y-3">
        <HostStage liveId={room.id} stage={stage} onChange={onStageChange} sections={["speaking", "invited", "requests"]} />
        <Footer room={room} details={props.details} failure={props.failure} connection={props.connection} mic={props.mic} phoneOnline={props.phoneOnline} />
      </div>
      <div role="tabpanel" id="panel-listeners" aria-labelledby="tab-listeners" hidden={tab !== "listeners"}>
        <HostStage liveId={room.id} stage={stage} onChange={onStageChange} sections={["listeners"]} heading={false} label="Listeners" />
      </div>
      <div role="tabpanel" id="panel-chat" aria-labelledby="tab-chat" hidden={tab !== "chat"}>
        <LiveChat liveId={room.id} isHost open pollMs={room.commentPollMs} onFresh={(n) => setUnread((u) => (tab === "chat" ? 0 : u + n))} />
      </div>
    </div>
  );
}

// ---- A live without a stage (browser-to-browser): the controls, then the chat ------------------------------------------
function PlainLayout(props: HostConsoleProps) {
  return (
    <div className="space-y-4">
      <section aria-label="Your live" className={card}>
        <Controls muted={props.muted} onToggleMute={props.onToggleMute} onEnd={props.onEnd} />
        <Notices phoneOnline={props.phoneOnline} connection={props.connection} failure={props.failure} mic={props.mic} />
        <Footer room={props.room} details={props.details} failure={props.failure} connection={props.connection} mic={props.mic} phoneOnline={props.phoneOnline} />
      </section>
      <LiveChat liveId={props.room.id} isHost open pollMs={props.room.commentPollMs} />
    </div>
  );
}

/**
 * The host's screen while live. Lives with a stage get the layout that suits the screen: tiles beside a listeners-and-chat
 * column on wide screens, and on a phone the controls on top with a tab each for the stage, the listeners and the chat.
 */
export function HostConsole(props: HostConsoleProps) {
  const wide = useIsWideScreen();
  if (!props.stage) return <PlainLayout {...props} />;
  const stage = props.stage;
  return wide ? <WideLayout {...props} stage={stage} /> : <PhoneLayout {...props} stage={stage} />;
}
