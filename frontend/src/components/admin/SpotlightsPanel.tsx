import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { mediaApi } from "../../api/media.api";
import { spotlightAdminApi, MAX_SPOTLIGHT_NOTE, type AdminSlot } from "../../api/spotlights.api";
import { Avatar } from "../common/Avatar";
import type { MediaItem } from "../../types";
import { t } from "../../i18n";

const input = "mt-1 block w-full rounded-md border border-white/20 bg-black/40 px-2 py-2 text-sm text-white";
const small = "rounded-md border border-white/25 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-50";

/** `onChanged` hands the new slots and a message to the panel, which keeps the message: a slot is drawn again when what is in it changes. */
function SlotEditor({ slot, current, notice, onChanged }: { slot: 1 | 2; current: AdminSlot; notice?: string; onChanged: (slots: AdminSlot[], message: string) => void }) {
  const occupant = current.empty ? null : current;
  const [username, setUsername] = useState(occupant?.user?.username ?? "");
  const [note, setNote] = useState(occupant?.note ?? "");
  const [pieceId, setPieceId] = useState<string>(occupant?.chosenPiece ?? "");
  const [pictures, setPictures] = useState<MediaItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function lookup() {
    setProblem(null);
    try {
      const { media } = await mediaApi.byUser(username.trim().replace(/^@/, ""));
      setPictures(media.filter((m) => m.type === "image"));
    } catch (err) {
      setPictures(null);
      setProblem(err instanceof ApiError ? err.message : t("spotlight.admin.failed"));
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !username.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      const { slots } = await spotlightAdminApi.set(slot, { username: username.trim(), ...(note.trim() ? { note: note.trim() } : {}), ...(pieceId ? { pieceId } : {}) });
      onChanged(slots, t("spotlight.admin.saved"));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("spotlight.admin.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await spotlightAdminApi.clear(slot);
      onChanged((await spotlightAdminApi.slots()).slots, t("spotlight.admin.cleared"));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("spotlight.admin.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t("spotlight.admin.slot", { n: slot })} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-sm font-semibold text-white">{t("spotlight.admin.slot", { n: slot })}</h3>

      {occupant && occupant.user ? (
        <div className="flex items-center gap-3">
          {occupant.piece ? <img src={occupant.piece.url} alt="" className="size-14 rounded object-cover" /> : <Avatar username={occupant.user.username} displayName={occupant.user.displayName} avatarUrl={occupant.user.avatarUrl} size={56} />}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {occupant.user.displayName} <bdi className="text-white/60">@{occupant.user.username}</bdi>
            </p>
            {occupant.note && (
              <p dir="auto" className="truncate text-xs text-white/70">
                {occupant.note}
              </p>
            )}
            {occupant.hidden && <p className="text-xs font-medium text-amber-300">{t(`spotlight.admin.hidden.${occupant.hidden}` as const)}</p>}
          </div>
        </div>
      ) : occupant ? (
        <p className="text-xs font-medium text-amber-300">{t("spotlight.admin.hidden.missing")}</p>
      ) : (
        <p className="text-sm text-white/60">{t("spotlight.admin.empty")}</p>
      )}

      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm text-white/80">
          {t("spotlight.admin.username")}
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setPictures(null);
                setPieceId("");
              }}
              autoCapitalize="none"
              spellCheck={false}
              className={input}
            />
            <button type="button" onClick={lookup} disabled={!username.trim()} className={`${small} mt-1 shrink-0`}>
              {t("spotlight.admin.lookup")}
            </button>
          </div>
        </label>

        {pictures && (
          <fieldset className="space-y-2">
            <legend className="text-sm text-white/80">{t("spotlight.admin.pictures")}</legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
              <input type="radio" name={`piece-${slot}`} checked={pieceId === ""} onChange={() => setPieceId("")} />
              {t("spotlight.admin.automatic")}
            </label>
            {pictures.length === 0 ? (
              <p className="text-xs text-white/60">{t("spotlight.admin.noPictures")}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {pictures.map((p) => (
                  <li key={p.id}>
                    <label className="block cursor-pointer">
                      <input type="radio" name={`piece-${slot}`} checked={pieceId === p.id} onChange={() => setPieceId(p.id)} className="sr-only peer" aria-label={p.caption || p.id} />
                      <img src={p.url} alt={p.caption ?? ""} className="size-16 rounded border-2 border-transparent object-cover peer-checked:border-violet-400 peer-focus-visible:ring-2 peer-focus-visible:ring-white" />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}

        <label className="block text-sm text-white/80">
          {t("spotlight.admin.note", { max: MAX_SPOTLIGHT_NOTE })}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_SPOTLIGHT_NOTE} dir="auto" className={input} />
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy || !username.trim()} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
            {busy ? t("spotlight.admin.saving") : t("spotlight.admin.save", { n: slot })}
          </button>
          {occupant && (
            <button type="button" onClick={clear} disabled={busy} className={small}>
              {t("spotlight.admin.clear")}
            </button>
          )}
        </div>
      </form>
      {notice && (
        <p role="status" className="text-sm text-emerald-400">
          {notice}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-red-400">
          {problem}
        </p>
      )}
    </section>
  );
}

/** For administrators: who is in the two artist spotlights on the main screen, a line about each, and the picture to show. */
export function SpotlightsPanel() {
  const [slots, setSlots] = useState<AdminSlot[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      setSlots((await spotlightAdminApi.slots()).slots);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("spotlight.admin.loadFailed"));
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <section aria-label={t("spotlight.admin.title")} className="space-y-3">
      <p className="text-sm text-white/70">{t("spotlight.admin.intro")}</p>
      {problem && (
        <p role="alert" className="text-sm text-red-400">
          {problem}
        </p>
      )}
      {!slots && !problem && <p className="text-sm text-white/60">{t("common.loading")}</p>}
      {slots && (
        <div className="grid gap-4 lg:grid-cols-2">
          {slots.map((s) => (
            // a slot is drawn again when what is in it changes, so its fields start from what was saved
            <SlotEditor
              key={`${s.slot}-${s.empty ? "empty" : `${s.user?.id}-${s.note}-${s.chosenPiece}`}`}
              slot={s.slot}
              current={s}
              notice={notices[s.slot]}
              onChanged={(next, message) => {
                setSlots(next);
                setNotices({ [s.slot]: message });
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
