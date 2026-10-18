import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { chainsApi, type Chain, type WaitingChain } from "../api/chains.api";
import { ChainCredits, ChainStack } from "../components/play/ChainStack";
import { CardListSkeleton, LoadingBlock } from "../components/common/Skeleton";
import { t } from "../i18n";

type Tab = "open" | "done" | "mine";

function Row({ chain }: { chain: WaitingChain }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="min-w-0">
        <p dir="auto" className="text-sm font-medium text-white">
          {chain.prompt || t("chain.noIdea")}
        </p>
        <p className="text-xs text-white/60">{t("chain.partOf", { n: chain.nextPart, total: chain.parts })}</p>
      </div>
      <Link to={`/chains/${chain.id}/draw`} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500">
        {t("chain.drawPart", { n: chain.nextPart })}
      </Link>
    </li>
  );
}

function Finished({ chain }: { chain: Chain }) {
  return (
    <li className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <Link to={`/chains/${chain.id}`} className="block text-sm font-medium text-white hover:underline" dir="auto">
        {chain.prompt || t("chain.noIdea")}
      </Link>
      <ChainStack parts={chain.sections} />
      <ChainCredits parts={chain.sections} />
    </li>
  );
}

function Mine({ chain }: { chain: Chain }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="min-w-0">
        <p dir="auto" className="text-sm font-medium text-white">
          {chain.prompt || t("chain.noIdea")}
        </p>
        <p className="text-xs text-white/60">{chain.complete ? t("chain.finished") : t("chain.waitingFor", { n: chain.count + 1, total: chain.parts })}</p>
      </div>
      <Link to={`/chains/${chain.id}`} className="text-sm text-violet-300 hover:underline">
        {chain.complete ? t("chain.reveal") : t("chain.title")}
      </Link>
    </li>
  );
}

export function ChainsPage() {
  const [tab, setTab] = useState<Tab>("open");
  const [open, setOpen] = useState<WaitingChain[] | null>(null);
  const [done, setDone] = useState<Chain[] | null>(null);
  const [mine, setMine] = useState<Chain[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (which: Tab, pageNumber: number) => {
    setError(null);
    try {
      if (which === "open") {
        const r = await chainsApi.open(pageNumber);
        setOpen((old) => (pageNumber === 1 ? r.chains : [...(old ?? []), ...r.chains]));
        setHasMore(r.hasMore);
      } else if (which === "done") {
        const r = await chainsApi.complete(pageNumber);
        setDone((old) => (pageNumber === 1 ? r.chains : [...(old ?? []), ...r.chains]));
        setHasMore(r.hasMore);
      } else {
        setMine((await chainsApi.mine()).chains);
        setHasMore(false);
      }
      setPage(pageNumber);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("chain.loadFailed"));
    }
  }, []);

  useEffect(() => {
    // the first page of a tab, when it is opened (the lists are fetched again each time, so they are never stale)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(tab, 1);
  }, [tab, load]);

  async function more() {
    setBusy(true);
    await load(tab, page + 1);
    setBusy(false);
  }

  const list = tab === "open" ? open : tab === "done" ? done : mine;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-white">{t("chain.title")}</h1>
        <p className="text-sm text-white/70">{t("chain.intro")}</p>
        <Link to="/chains/new" className="inline-block rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500">
          {t("chain.start")}
        </Link>
      </header>

      <div role="group" aria-label={t("chain.tabs")} className="flex flex-wrap gap-2">
        {(["open", "done", "mine"] as const).map((which) => (
          <button
            key={which}
            type="button"
            aria-pressed={tab === which}
            onClick={() => setTab(which)}
            className={`rounded-full border px-3 py-1 text-sm ${tab === which ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/20 text-white/70 hover:bg-white/10"}`}
          >
            {t(`chain.tab.${which}` as const)}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {list === null && !error && (
        <LoadingBlock label={t("common.loading")}>
          <CardListSkeleton />
        </LoadingBlock>
      )}
      {list && list.length === 0 && <p className="text-sm text-white/60">{t(tab === "open" ? "chain.emptyOpen" : tab === "done" ? "chain.emptyDone" : "chain.emptyMine")}</p>}
      {list && list.length > 0 && (
        <ul className="space-y-3">
          {tab === "open" && open!.map((c) => <Row key={c.id} chain={c} />)}
          {tab === "done" && done!.map((c) => <Finished key={c.id} chain={c} />)}
          {tab === "mine" && mine!.map((c) => <Mine key={c.id} chain={c} />)}
        </ul>
      )}
      {hasMore && (
        <button type="button" onClick={more} disabled={busy} className="w-full rounded-md border border-white/20 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50">
          {busy ? t("common.loading") : t("chain.more")}
        </button>
      )}
    </div>
  );
}
