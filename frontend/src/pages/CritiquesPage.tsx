import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { critiquesApi } from "../api/critiques.api";
import { CritiqueCard } from "../components/critique/CritiqueParts";
import type { Critique } from "../types";
import { t } from "../i18n";

type Tab = "board" | "mine" | "answered";

/** Requests for feedback: the ones open now from people you can see, your own, and the ones you answered. */
export function CritiquesPage() {
  const [tab, setTab] = useState<Tab>("board");
  const [rows, setRows] = useState<Critique[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (which: Tab) => {
    setRows(null);
    setError(null);
    try {
      if (which === "mine") setRows((await critiquesApi.mine()).critiques);
      else if (which === "answered") setRows((await critiquesApi.answered()).answers.map((a) => ({ ...a.critique, answered: true })));
      else {
        const r = await critiquesApi.board();
        setRows(r.critiques);
        setHasMore(r.hasMore);
        setNext(r.next);
      }
    } catch (err) {
      setRows([]);
      setError(err instanceof ApiError ? err.message : t("critique.loadFailed"));
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  async function more() {
    if (!next) return;
    setLoadingMore(true);
    try {
      const r = await critiquesApi.board(next);
      setRows((old) => [...(old ?? []), ...r.critiques.filter((c) => !(old ?? []).some((o) => o.id === c.id))]);
      setHasMore(r.hasMore);
      setNext(r.next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("critique.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  const tabs: [Tab, string][] = [
    ["board", t("critique.tabBoard")],
    ["mine", t("critique.tabMine")],
    ["answered", t("critique.tabAnswered")],
  ];
  const empty = { board: t("critique.none"), mine: t("critique.noneMine"), answered: t("critique.noneAnswered") }[tab];

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">{t("critique.title")}</h1>
        <p className="text-sm text-white/70">{t("critique.intro")}</p>
      </header>
      <div role="group" aria-label={t("critique.tabs")} className="flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key} className={`rounded-full border px-3 py-1 text-xs ${tab === key ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/20 text-white/70 hover:bg-white/10"}`}>
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {rows === null && !error && <p className="text-sm text-white/60">{t("common.loading")}</p>}
      {rows?.length === 0 && !error && <p className="text-sm text-white/60">{empty}</p>}
      <div className="space-y-3">
        {rows?.map((c) => (
          <CritiqueCard key={c.id} critique={c} />
        ))}
      </div>
      {hasMore && tab === "board" && (
        <button type="button" onClick={more} disabled={loadingMore} className="w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
          {loadingMore ? t("common.loading") : t("critique.showMore")}
        </button>
      )}
    </div>
  );
}
