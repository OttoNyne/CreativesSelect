import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { liveApi, MAX_LIVE_TITLE_LENGTH } from "../api/live.api";
import { scheduledApi } from "../api/scheduled.api";
import { ScheduleLive } from "../components/live/ScheduleLive";
import { UpcomingLives } from "../components/live/UpcomingLives";
import { ApiError } from "../api/client";
import { Avatar } from "../components/common/Avatar";
import { liveAudioSupported, unsupportedMessage } from "../lib/live/rtc";
import { holdStreamFor, MIC_CONSTRAINTS, micErrorMessage } from "../lib/live/hostStream";
import type { LiveRoom, ScheduledLive } from "../types";
import { t } from "../i18n";

const POLL_MS = 10_000;

export function LivePage() {
  const navigate = useNavigate();
  const [lives, setLives] = useState<LiveRoom[] | null>(null);
  // what a live started now would allow (known once the list has loaded)
  const [maxListeners, setMaxListeners] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [title, setTitle] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [plans, setPlans] = useState<ScheduledLive[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadPlans = () =>
      scheduledApi
        .list()
        .then(({ scheduled }) => !cancelled && setPlans(scheduled))
        .catch(() => !cancelled && setPlans((old) => old ?? []));
    void loadPlans();
    const timer = setInterval(() => !document.hidden && void loadPlans(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { lives, config } = await liveApi.list();
        if (!cancelled) {
          setLives(lives);
          if (config) setMaxListeners(config.maxListeners);
          setLoadError(false);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  function handleGoLive(e: React.FormEvent) {
    e.preventDefault();
    void startLive(title.trim());
  }

  // Starts a live (optionally as the fulfilment of a planned one). The microphone prompt has to come from the tap that got
  // us here, so this is called straight from the button's handler.
  async function startLive(name: string, scheduledId?: string) {
    if (!name || starting) return;
    setStartError(null);
    if (!navigator.mediaDevices?.getUserMedia || !liveAudioSupported()) {
      return setStartError(unsupportedMessage(true));
    }
    setStarting(true);
    // The microphone prompt has to come from this tap, so it happens before the live is created.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    } catch (err) {
      setStarting(false);
      return setStartError(micErrorMessage(err));
    }
    try {
      const { live } = await (scheduledId ? liveApi.start(name, scheduledId) : liveApi.start(name));
      holdStreamFor(live.id, stream);
      navigate(`/live/${live.id}`);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setStartError(err instanceof ApiError ? err.message : t("live.couldntStartYourLive"));
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-white">{t("nav.live")}</h1>
        <p className="mt-1 text-sm text-white/60">{t("live.voiceOnlyLiveRooms")}</p>
      </div>

      <form onSubmit={handleGoLive} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">{t("live.goLive")}</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_LIVE_TITLE_LENGTH}
            placeholder={t("live.whatsYourLiveAbout")}
            aria-label={t("live.liveTitle")}
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!title.trim() || starting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {starting ? t("settings.starting") : t("live.goLive")}
          </button>
        </div>
        <p className="mt-2 text-xs text-white/60">
          {t("live.hostNote", { limit: maxListeners ? t("live.upToListeners", { n: maxListeners }) : t("live.listenersCanJoinWhile") })}
        </p>
        {startError && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {startError}
          </p>
        )}
      </form>

      <ScheduleLive onScheduled={(plan) => setPlans((old) => [...(old ?? []), plan].sort((a, b) => a.startsAt.localeCompare(b.startsAt)))} />

      <UpcomingLives plans={plans} onChange={setPlans} onStartNow={(plan) => void startLive(plan.title, plan.id)} starting={starting} />

      <section aria-label={t("live.liveNow")}>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/60">{t("live.liveNow")}</h2>
        {lives === null && !loadError && <p className="text-sm text-white/60">{t("common.loading")}</p>}
        {loadError && lives === null && <p className="text-sm text-red-400">{t("live.couldntLoadTheLives")}</p>}
        {lives?.length === 0 && <p className="text-sm text-white/60">{t("live.noOneIsLive")}</p>}
        <div className="space-y-2">
          {lives?.map((l) => (
            <Link
              key={l.id}
              to={`/live/${l.id}`}
              className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06]"
            >
              <Avatar username={l.host.username} displayName={l.host.displayName} avatarUrl={l.host.avatarUrl} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-white">{l.title}</span>
                <span className="block truncate text-xs text-white/60">
                  {l.isHost ? t("groups.you") : l.host.displayName} · {t("live.listeningCount", { n: l.listenerCount })}
                </span>
              </span>
              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{t("nav.live")}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
