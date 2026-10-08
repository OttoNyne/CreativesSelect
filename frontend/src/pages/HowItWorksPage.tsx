import { InfoPage } from "../components/layout/InfoPage";
import { t } from "../i18n";

const STEPS = [
  { get title() { return t("info.createYourAccount"); }, get text() { return t("info.signUpWithYour"); } },
  { get title() { return t("info.makeItYours"); }, get text() { return t("info.customiseYourProfileAdd"); } },
  { get title() { return t("info.connect"); }, get text() { return t("info.searchForOtherCreatives"); } },
  { get title() { return t("info.shareAndCollaborate"); }, get text() { return t("info.postToYourFeed"); } },
  { get title() { return t("info.stayInControl"); }, get text() { return t("info.makeYourProfilePrivate"); } },
];

export function HowItWorksPage() {
  return (
    <InfoPage title={t("footer.howItWorks")} intro="From sign-up to sharing your work, in five steps.">
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white"
            >
              {i + 1}
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">{s.title}</h2>
              <p className="mt-1 text-sm text-white/70">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </InfoPage>
  );
}
