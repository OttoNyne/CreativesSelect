import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { API_BASE } from "../api/base";
import { CHAIN_SECTION_HEIGHT, CHAIN_SECTION_WIDTH, chainsApi, type WaitingChain } from "../api/chains.api";
import { Sketchpad } from "../components/play/Sketchpad";
import { LoadingBlock, Skeleton } from "../components/common/Skeleton";
import { edgePicture, partPicture } from "../lib/chainPictures";
import { clearDraft } from "../lib/sketch";
import { sparkOfDay, sparkText } from "../lib/sparks";
import { t } from "../i18n";

const MAX_IDEA = 100;

/**
 * Drawing a part of a chain. With no id in the address it is the first part of a new chain (and an idea can be written); with one it is the
 * next part of a waiting chain, which is taken for a while as the page opens and given back if the person leaves without sending it. The
 * next part is drawn beneath the strip along the bottom of the part before, and nothing else of it is shown.
 */
export function ChainDrawPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [taken, setTaken] = useState<{ chain: WaitingChain; until: number } | null>(null);
  const [claimProblem, setClaimProblem] = useState<string | null>(null);
  const [strokes, setStrokes] = useState(0);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const sent = useRef(false);
  const held = useRef(false);

  const take = useCallback(async () => {
    if (!id) return;
    setClaimProblem(null);
    try {
      const r = await chainsApi.claim(id);
      held.current = true;
      // the minutes left are counted from now, not from when the page opened
      setNow(Date.now());
      setTaken({ chain: r.chain, until: Date.parse(r.claimedUntil) });
    } catch (err) {
      setClaimProblem(err instanceof ApiError ? err.message : t("chain.claimFailed"));
    }
  }, [id]);

  useEffect(() => {
    // take the part as the page opens, and give it back if the person leaves without sending it
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void take();
    return () => {
      if (id && held.current && !sent.current) void chainsApi.release(id).catch(() => {});
      held.current = false;
    };
  }, [id, take]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const draftKey = `cs-chain-draft-${id ?? "new"}`;
  const minutesLeft = taken ? Math.ceil((taken.until - now) / 60_000) : 0;
  const isLast = taken ? taken.chain.nextPart >= taken.chain.parts : false;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || busy || !strokes) return;
    setBusy(true);
    setProblem(null);
    try {
      const section = await partPicture(canvas);
      if (!section) throw new Error("no picture");
      if (!id) {
        const edge = await edgePicture(canvas);
        if (!edge) throw new Error("no edge");
        await chainsApi.start(section, edge, idea.trim());
        sent.current = true;
        clearDraft(draftKey);
        setSentNote(t("chain.sent"));
      } else {
        const edge = isLast ? null : await edgePicture(canvas);
        const { chain } = await chainsApi.addPart(id, section, edge);
        sent.current = true;
        clearDraft(draftKey);
        if (chain.complete) return navigate(`/chains/${id}`, { replace: true });
        setSentNote(t("chain.sentPart", { n: chain.count + 1 }));
      }
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : t("chain.sendFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (sentNote) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
        <p role="status" className="text-sm font-medium text-emerald-300">
          {sentNote}
        </p>
        <Link to="/chains" className="inline-block rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500">
          {t("chain.all")}
        </Link>
      </div>
    );
  }

  if (id && claimProblem) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
        <p role="alert" className="text-sm text-red-400">
          {claimProblem}
        </p>
        <Link to="/chains" className="text-sm text-violet-300 hover:underline">
          {t("chain.all")}
        </Link>
      </div>
    );
  }

  if (id && !taken) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
        <LoadingBlock label={t("chain.claiming")}>
          <Skeleton className="h-24 w-full" />
        </LoadingBlock>
      </div>
    );
  }

  const edgeStrip = taken && (
    <figure className="mb-1">
      <img src={`${API_BASE}${taken.chain.edgeUrl}`} alt={t("chain.edgeAlt")} className="block w-full rounded-t-lg border border-white/20 bg-[#fffdf8]" />
      <figcaption className="mt-1 text-xs text-white/70">{t("chain.edgeCaption")}</figcaption>
    </figure>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">{taken ? t("chain.drawTitle", { n: taken.chain.nextPart, total: taken.chain.parts }) : t("chain.new.title")}</h1>
        <p className="text-sm text-white/70">{taken ? (taken.chain.prompt ? taken.chain.prompt : t("chain.noIdea")) : t("chain.new.intro")}</p>
        {taken && isLast && <p className="text-sm text-violet-300">{t("chain.lastPart")}</p>}
        {taken && (
          <p className="text-xs text-white/60">
            {minutesLeft > 0 ? (
              t("chain.timeLeft", { n: minutesLeft })
            ) : (
              <>
                {t("chain.timeUp")}{" "}
                <button type="button" onClick={take} className="text-violet-300 underline">
                  {t("chain.takeAgain")}
                </button>
              </>
            )}
          </p>
        )}
      </header>

      {!id && (
        <div className="space-y-1">
          <label className="block text-sm text-white/80">
            {t("chain.idea")}
            <input
              value={idea}
              maxLength={MAX_IDEA}
              dir="auto"
              onChange={(e) => setIdea(e.target.value)}
              className="mt-1 block w-full rounded-md border border-white/20 bg-black/40 px-2 py-2 text-sm text-white"
            />
          </label>
          <p className="text-xs text-white/60">{t("chain.ideaHint")}</p>
          <button type="button" onClick={() => setIdea(sparkText(sparkOfDay()).slice(0, MAX_IDEA))} className="rounded-md border border-white/25 px-3 py-1 text-sm text-white hover:bg-white/10">
            {t("chain.useSpark")}
          </button>
        </div>
      )}

      <Sketchpad key={draftKey} canvasRef={canvasRef} onStrokes={setStrokes} width={CHAIN_SECTION_WIDTH} height={CHAIN_SECTION_HEIGHT} draftKey={draftKey} above={edgeStrip} />

      <form onSubmit={send} className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !strokes || (Boolean(id) && minutesLeft <= 0)} className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
          {busy ? t("chain.sending") : id && taken ? t("chain.sendPart", { n: taken.chain.nextPart }) : t("chain.send")}
        </button>
        <Link to="/chains" className="text-sm text-violet-300 hover:underline">
          {id ? t("chain.giveBack") : t("chain.all")}
        </Link>
      </form>
      {problem && (
        <p role="alert" className="text-sm text-red-400">
          {problem}
        </p>
      )}
    </div>
  );
}
