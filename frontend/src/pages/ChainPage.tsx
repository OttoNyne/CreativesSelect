import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { API_BASE } from "../api/base";
import { chainsApi, type Chain } from "../api/chains.api";
import { uploadFile } from "../api/media.api";
import { ChainCredits, ChainStack } from "../components/play/ChainStack";
import { ReportButton } from "../components/common/ReportButton";
import { LoadingBlock, Skeleton } from "../components/common/Skeleton";
import { joinParts } from "../lib/chainPictures";
import { t } from "../i18n";

export function ChainPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [chain, setChain] = useState<Chain | null>(null);
  const [missing, setMissing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sure, setSure] = useState(false);

  useEffect(() => {
    let live = true;
    chainsApi
      .get(id)
      .then(({ chain: found }) => live && setChain(found))
      .catch((err) => live && (err instanceof ApiError && err.status === 404 ? setMissing(true) : setProblem(err instanceof ApiError ? err.message : t("chain.loadFailed"))));
    return () => {
      live = false;
    };
  }, [id]);

  async function saveToPortfolio() {
    if (!chain || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      const picture = await joinParts(chain.sections.map((s) => `${API_BASE}${s.imageUrl}`));
      if (!picture) throw new Error("no picture");
      const names = chain.sections.map((s) => s.author?.displayName).filter(Boolean).join(", ");
      const caption = t("chain.saveCaption", { names }).slice(0, 200);
      await uploadFile(new File([picture], "chain.png", { type: "image/png" }), "portfolio", caption);
      setNotice(t("chain.saved"));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("chain.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function takeBack() {
    if (!sure) return setSure(true);
    try {
      await chainsApi.remove(id);
      navigate("/chains", { replace: true });
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("chain.loadFailed"));
    }
  }

  if (missing) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
        <p className="text-sm text-white/70">{t("chain.notFound")}</p>
        <Link to="/chains" className="text-sm text-violet-300 hover:underline">
          {t("chain.all")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <Link to="/chains" className="text-sm text-violet-300 hover:underline">
        {t("chain.all")}
      </Link>
      {problem && (
        <p role="alert" className="text-sm text-red-400">
          {problem}
        </p>
      )}
      {!chain && !problem && (
        <LoadingBlock label={t("common.loading")}>
          <Skeleton className="h-40 w-full" />
        </LoadingBlock>
      )}
      {chain && (
        <>
          <header className="space-y-1">
            <h1 dir="auto" className="text-xl font-semibold text-white">
              {chain.prompt || t("chain.title")}
            </h1>
            <p className="text-sm text-white/70">{chain.complete ? t("chain.reveal") : t("chain.waitingFor", { n: chain.count + 1, total: chain.parts })}</p>
          </header>

          {chain.complete ? (
            <>
              <ChainStack parts={chain.sections} reveal />
              <ChainCredits parts={chain.sections} />
              <div className="flex flex-wrap items-center gap-3">
                {chain.mine && (
                  <button type="button" onClick={saveToPortfolio} disabled={saving} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                    {saving ? t("chain.saving") : t("chain.save")}
                  </button>
                )}
                {chain.sections.map((part) => (
                  <ReportButton key={part.id} targetType="chainSection" targetId={part.id} label={t("chain.reportPart", { n: part.index + 1 })} />
                ))}
              </div>
              {notice && (
                <p role="status" className="text-sm text-emerald-400">
                  {notice}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-white/70">{t("chain.view.waiting")}</p>
              {chain.canDelete && (
                <button type="button" onClick={takeBack} onBlur={() => setSure(false)} className={`rounded-md border px-3 py-1.5 text-sm text-white ${sure ? "border-red-400 bg-red-500/20" : "border-white/25 hover:bg-white/10"}`}>
                  {sure ? t("chain.deleteSure") : t("chain.delete")}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
