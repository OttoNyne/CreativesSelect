import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { callsApi } from "../api/calls.api";
import { CallCard } from "../components/calls/CallCard";
import { CallForm } from "../components/calls/CallForm";
import type { OpenCall } from "../types";
import { t } from "../i18n";

type Tab = "all" | "foryou" | "mine" | "applied";
type Row = { call: OpenCall; status?: "waiting" | "chosen" | "passed" };

/** Open calls: the board of what people are looking for, the ones that fit what you offer, your own, and the ones you answered. */
export function CallsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (which: Tab) => {
    setRows(null);
    setError(null);
    try {
      if (which === "mine") setRows((await callsApi.mine()).calls.map((call) => ({ call })));
      else if (which === "applied") setRows((await callsApi.applied()).applications.map((a) => ({ call: a.call, status: a.status })));
      else {
        const r = await callsApi.board({ forMe: which === "foryou" });
        setRows(r.calls.map((call) => ({ call })));
        setHasMore(r.hasMore);
        setNext(r.next);
      }
    } catch (err) {
      setRows([]);
      setError(err instanceof ApiError ? err.message : t("calls.loadFailed"));
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  async function more() {
    if (!next) return;
    setLoadingMore(true);
    try {
      const r = await callsApi.board({ forMe: tab === "foryou", before: next });
      setRows((old) => [...(old ?? []), ...r.calls.filter((c) => !(old ?? []).some((o) => o.call.id === c.id)).map((call) => ({ call }))]);
      setHasMore(r.hasMore);
      setNext(r.next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("calls.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  const tabs: [Tab, string][] = [
    ["all", t("calls.tabAll")],
    ["foryou", t("calls.tabForYou")],
    ["mine", t("calls.tabMine")],
    ["applied", t("calls.tabApplied")],
  ];
  const empty = { all: t("calls.none"), foryou: t("calls.noneForYou"), mine: t("calls.noneMine"), applied: t("calls.noneApplied") }[tab];

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">{t("calls.title")}</h1>
        <p className="text-sm text-white/70">{t("calls.intro")}</p>
      </header>

      {posting ? (
        <CallForm
          onCancel={() => setPosting(false)}
          onDone={(_call, told) => {
            setPosting(false);
            setNotice(told > 0 ? t("calls.posted", { n: told }) : null);
            if (tab === "mine") void load("mine");
            else setTab("mine");
          }}
        />
      ) : (
        <button type="button" onClick={() => setPosting(true)} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
          {t("calls.post")}
        </button>
      )}
      {notice && (
        <p role="status" className="text-sm text-violet-200">
          {notice}
        </p>
      )}

      <div role="group" aria-label={t("calls.tabs")} className="flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setNotice(null);
              setTab(key);
            }}
            aria-pressed={tab === key}
            className={`rounded-full border px-3 py-1 text-xs ${tab === key ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/20 text-white/70 hover:bg-white/10"}`}
          >
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
        {rows?.map(({ call, status }) => (
          <CallCard key={call.id} call={call} status={status} />
        ))}
      </div>
      {hasMore && (tab === "all" || tab === "foryou") && (
        <button type="button" onClick={more} disabled={loadingMore} className="w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
          {loadingMore ? t("common.loading") : t("calls.showMore")}
        </button>
      )}
    </div>
  );
}
