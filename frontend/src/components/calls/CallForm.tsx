import { useState } from "react";
import { ApiError } from "../../api/client";
import { callsApi } from "../../api/calls.api";
import type { OpenCall } from "../../types";
import { RolesInput } from "./RolesInput";
import { t } from "../../i18n";

const field = "w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none";

/** Post an open call, or (given `call`) change one: title, what it looks for, the roles, terms and a last day. Says why it couldn't be saved. */
export function CallForm({ call, onDone, onCancel }: { call?: OpenCall; onDone: (call: OpenCall, told: number) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(call?.title ?? "");
  const [details, setDetails] = useState(call?.details ?? "");
  const [roles, setRoles] = useState<string[]>(call?.lookingFor ?? []);
  const [budget, setBudget] = useState(call?.budget ?? "");
  const [deadline, setDeadline] = useState(call?.deadline ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const input = { title: title.trim(), details: details.trim(), lookingFor: roles, budget: budget.trim(), deadline: deadline || null };
    try {
      if (call) {
        const { call: saved } = await callsApi.update(call.id, input);
        onDone({ ...call, ...saved }, 0);
      } else {
        const { call: made, told } = await callsApi.create(input);
        onDone(made, told);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("calls.failed"));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <label className="block text-xs text-white/70">
        {t("calls.formTitle")}
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} dir="auto" placeholder={t("calls.formTitlePlaceholder")} className={`${field} mt-1`} />
      </label>
      <label className="block text-xs text-white/70">
        {t("calls.formDetails")}
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1500} rows={5} dir="auto" placeholder={t("calls.formDetailsPlaceholder")} className={`${field} mt-1`} />
      </label>
      <RolesInput roles={roles} onChange={setRoles} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-white/70">
          {t("calls.formBudget")}
          <input value={budget} onChange={(e) => setBudget(e.target.value)} maxLength={40} dir="auto" placeholder={t("calls.formBudgetPlaceholder")} className={`${field} mt-1`} />
        </label>
        <label className="block text-xs text-white/70">
          {t("calls.formDeadline")}
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={`${field} mt-1`} />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy || !title.trim() || !details.trim()} className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
          {busy ? (call ? t("calls.saving") : t("calls.posting")) : call ? t("calls.saveChanges") : t("calls.submit")}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="text-sm text-white/70 hover:text-white hover:underline disabled:opacity-50">
          {t("calls.cancel")}
        </button>
      </div>
    </form>
  );
}
