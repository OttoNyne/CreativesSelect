import { InfoPage } from "../components/layout/InfoPage";

const STEPS = [
  { title: "Create your account", text: "Sign up with your email and pick a username. We'll email you a link to confirm your address." },
  { title: "Make it yours", text: "Customise your profile, add pictures to your portfolio, and put up to twenty tracks on your page." },
  { title: "Connect", text: "Search for other creatives, send friend requests, and join groups. Friends can message you and see your posts in their feed." },
  { title: "Share and collaborate", text: "Post to your feed, ask for help or offer it on the Help wanted board, or go live with your voice and chat with listeners." },
  { title: "Stay in control", text: "Make your profile private, block or report anyone, and delete your account whenever you like." },
];

export function HowItWorksPage() {
  return (
    <InfoPage title="How it works" intro="From sign-up to sharing your work, in five steps.">
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
