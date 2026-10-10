import { InfoPage } from "../components/layout/InfoPage";
import { CONTACT_EMAIL } from "../lib/contact";
import { t, type Key } from "../i18n";
import { tRich } from "../i18n/rich";

export type LegalDoc = "privacy" | "terms" | "guidelines";

/** How many numbered sections each document has (their words are legal.<doc>.<n>h and legal.<doc>.<n>p). */
const SECTIONS: Record<LegalDoc, number> = { privacy: 10, terms: 9, guidelines: 7 };

/** The Privacy Policy, the Terms of Use or the Community guidelines: a heading, the date, numbered plain-word sections and who to write to. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const word = (part: string) => t(`legal.${doc}.${part}` as Key);
  return (
    <InfoPage title={word("title")} intro={word("intro")}>
      <div className="space-y-6 text-white/80">
        <p className="text-sm text-white/60">{t("legal.updated", { date: t("legal.updatedDate") })}</p>
        {Array.from({ length: SECTIONS[doc] }, (_, i) => i + 1).map((n) => (
          <section key={n}>
            <h2 className="text-lg font-semibold text-white">{word(`${n}h`)}</h2>
            <p className="mt-2">{word(`${n}p`)}</p>
          </section>
        ))}
        <p className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/80">
          {CONTACT_EMAIL ? tRich("legal.contactWith", { email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-violet-300 hover:underline">{CONTACT_EMAIL}</a> }) : t("legal.contactWithout")}
        </p>
      </div>
    </InfoPage>
  );
}
