import { InfoPage } from "../components/layout/InfoPage";
import { t } from "../i18n";

const FEATURES = [
  { icon: "🎨", get title() { return t("info.aProfileThatsYours"); }, get text() { return t("info.pickYourColoursOne"); } },
  { icon: "🖼️", get title() { return t("sections.portfolio"); }, get text() { return t("info.showPicturesAndShort"); } },
  { icon: "🎵", get title() { return t("sections.music"); }, get text() { return t("info.addUpToTwenty"); } },
  { icon: "📝", get title() { return t("nav.feed"); }, get text() { return t("info.shareWhatYoureWorking"); } },
  { icon: "💬", get title() { return t("info.messagesAndGroupChat"); }, get text() { return t("info.chatPrivatelyWithFriends"); } },
  { icon: "👥", get title() { return t("info.friendsAndGroups"); }, get text() { return t("info.searchForPeopleThose"); } },
  { icon: "🤝", get title() { return t("nav.helpWanted"); }, get text() { return t("info.postARequestOn"); } },
  { icon: "🎙️", get title() { return t("info.liveAudio"); }, get text() { return t("info.goLiveWithYour"); } },
  { icon: "✨", get title() { return t("info.aiAssistance"); }, get text() { return t("info.optionallyGenerateACaption"); } },
  { icon: "🔒", get title() { return t("info.privacyAndSafety"); }, get text() { return t("info.privateProfilesBlockingReporting"); } },
  { icon: "🤝", get title() { return t("info.creditsTitle"); }, get text() { return t("info.creditsText"); } },
  { icon: "💼", get title() { return t("info.workTitle"); }, get text() { return t("info.workText"); } },
  { icon: "🏆", get title() { return t("info.challengeTitle"); }, get text() { return t("info.challengeText"); } },
  { icon: "★", get title() { return t("info.saveTitle"); }, get text() { return t("info.saveText"); } },
  { icon: "#", get title() { return t("info.exploreTitle"); }, get text() { return t("info.exploreText"); } },
  { icon: "➕", get title() { return t("info.followTitle"); }, get text() { return t("info.followText"); } },
  { icon: "↩", get title() { return t("info.repliesTitle"); }, get text() { return t("info.repliesText"); } },
  { icon: "📌", get title() { return t("info.pinTitle"); }, get text() { return t("info.pinText"); } },
  { icon: "📊", get title() { return t("info.pollsTitle"); }, get text() { return t("info.pollsText"); } },
  { icon: "🔇", get title() { return t("info.mutingTitle"); }, get text() { return t("info.mutingText"); } },
  { icon: "@", get title() { return t("info.mentionsTitle"); }, get text() { return t("info.mentionsText"); } },
  { icon: "🔗", get title() { return t("info.shareTitle"); }, get text() { return t("info.shareText"); } },
  { icon: "📱", get title() { return t("info.worksOnYourPhone"); }, get text() { return t("info.useItInAny"); } },
  { icon: "🌍", get title() { return t("info.languagesTitle"); }, get text() { return t("info.languagesText"); } },
];

export function FeaturesPage() {
  return (
    <InfoPage title={t("footer.features")} intro={t("info.featuresIntro")}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <li key={f.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <span aria-hidden="true">{f.icon}</span>
              {f.title}
            </h2>
            <p className="mt-1.5 text-sm text-white/70">{f.text}</p>
          </li>
        ))}
      </ul>
    </InfoPage>
  );
}
