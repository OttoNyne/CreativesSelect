import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, assetUrl } from "../../api/client";
import { creditsApi } from "../../api/credits.api";
import { t } from "../../i18n";
import type { CreditedPiece } from "../../types";

/** A small picture (or an icon, for a video or a song) standing for a piece. */
function Thumb({ piece }: { piece: CreditedPiece }) {
  const { item } = piece;
  if (item.type === "image") return <img src={assetUrl(item.url)} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />;
  return (
    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white/10 text-lg">
      {item.type === "audio" ? "♪" : "▶"}
    </span>
  );
}

/** The credits waiting for the owner of this profile to answer: who asked, for which piece, and as what. */
export function CreditRequests({ onAccepted }: { onAccepted: () => void }) {
  const [requests, setRequests] = useState<CreditedPiece[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    creditsApi
      .mine()
      .then(({ requests: list }) => current && setRequests(list))
      .catch(() => {}); // a list that can't be loaded is just not shown
    return () => {
      current = false;
    };
  }, []);

  async function answer(request: CreditedPiece, accept: boolean) {
    if (busy) return;
    setBusy(request.id);
    setProblem(null);
    try {
      if (accept) await creditsApi.accept(request.id);
      else await creditsApi.remove(request.id);
      setRequests((list) => list.filter((r) => r.id !== request.id));
      if (accept) onAccepted();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("credits.couldntDoThat"));
    } finally {
      setBusy(null);
    }
  }

  if (requests.length === 0) return null;
  return (
    <section aria-label={t("credits.requestsTitle")} className="mt-3 rounded-lg border border-[var(--profile-accent)] bg-white/5 p-2">
      <h3 className="text-xs font-semibold text-white">{t("credits.requestsTitle")}</h3>
      <ul className="mt-1.5 space-y-1.5">
        {requests.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-xs text-white/80">
            <Thumb piece={r} />
            <span className="min-w-0 flex-1">
              {t("credits.askedYou", { name: r.owner.displayName })} <span dir="auto" className="font-medium text-white">{r.role}</span>
              {r.item.caption && (
                <span dir="auto" className="block truncate text-white/60">
                  {r.item.caption}
                </span>
              )}
            </span>
            <button type="button" disabled={busy !== null} onClick={() => answer(r, true)} className="rounded-md bg-[var(--profile-accent-fill)] px-2 py-1 font-medium text-[var(--profile-on-accent)] disabled:opacity-50">
              {t("friends.accept")}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => answer(r, false)} className="rounded-md border border-white/20 px-2 py-1 text-white/80 hover:bg-white/10 disabled:opacity-50">
              {t("friends.decline")}
            </button>
          </li>
        ))}
      </ul>
      {problem && (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {problem}
        </p>
      )}
    </section>
  );
}

/** The pieces other people made that this person worked on, each linking to the piece on its owner's profile. Nothing when there are none. */
export function Collaborations({ username, refreshKey = 0 }: { username: string; refreshKey?: number }) {
  const [pieces, setPieces] = useState<CreditedPiece[]>([]);

  useEffect(() => {
    let current = true;
    creditsApi
      .forUser(username)
      .then(({ collaborations }) => current && setPieces(collaborations))
      .catch(() => current && setPieces([]));
    return () => {
      current = false;
    };
  }, [username, refreshKey]);

  if (pieces.length === 0) return null;
  return (
    <section aria-label={t("credits.collaborations")} className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--profile-muted)]">{t("credits.collaborations")}</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {pieces.map((p) => (
          <li key={p.id}>
            <Link to={`/u/${p.owner.username}?piece=${encodeURIComponent(p.item.id)}#portfolio`} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs text-white/80 hover:bg-white/10">
              <Thumb piece={p} />
              <span className="min-w-0">
                <span dir="auto" className="block truncate font-medium text-white">
                  {p.role}
                </span>
                <span className="block truncate text-white/60">{t("credits.byOwner", { name: p.owner.displayName })}</span>
                {p.item.caption && (
                  <span dir="auto" className="block truncate text-white/60">
                    {p.item.caption}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
