import { useId, useState } from "react";
import { MAX_TAG, MIN_TAG, isValidTag, normalizeTag } from "../../lib/tags";
import { t } from "../../i18n";

export const MAX_ROLES = 5;

/** The kinds of people a call looks for (up to five): type one and press Enter or comma; each is kept as a tag like the ones on profiles. */
export function RolesInput({ roles, onChange }: { roles: string[]; onChange: (roles: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const id = useId();
  const tag = normalizeTag(draft);
  const problem = tag && (!isValidTag(tag) ? t("lib.tagRange", { min: MIN_TAG, max: MAX_TAG }) : roles.includes(tag) ? t("lib.tagExists", { tag }) : null);

  function add() {
    if (!tag || problem || roles.length >= MAX_ROLES) return;
    onChange([...roles, tag]);
    setDraft("");
  }

  return (
    <div className="text-xs text-white/70">
      <label htmlFor={id}>{t("calls.formRoles", { max: MAX_ROLES })}</label>
      <ul aria-label={t("calls.rolesList")} className="mt-1 flex flex-wrap gap-1.5">
        {roles.map((role) => (
          <li key={role} className="flex items-center gap-1 rounded-full border border-white/20 bg-white/5 py-0.5 ps-2.5 pe-1 text-xs text-white">
            <bdi>{role}</bdi>
            <button type="button" onClick={() => onChange(roles.filter((r) => r !== role))} aria-label={t("calls.removeRole", { role })} className="rounded-full px-1.5 text-white/70 hover:bg-white/10 hover:text-white">
              ✕
            </button>
          </li>
        ))}
      </ul>
      {roles.length < MAX_ROLES && (
        <div className="mt-1.5 flex gap-2">
          <input
            id={id}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
            dir="auto"
            placeholder={t("calls.formRolesPlaceholder")}
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-violet-500 focus:outline-none"
          />
          <button type="button" onClick={add} disabled={!tag || Boolean(problem)} className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50">
            {t("calls.addRole")}
          </button>
        </div>
      )}
      {problem && (
        <p role="alert" className="mt-1 text-red-400">
          {problem}
        </p>
      )}
    </div>
  );
}
