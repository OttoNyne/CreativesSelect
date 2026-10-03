import { Link } from "react-router-dom";
import { InfoPage } from "../components/layout/InfoPage";

export function AboutPage() {
  return (
    <InfoPage
      title="About CreativesSelect"
      intro="A social platform for painters, musicians, designers, writers and makers to show their work, find each other and collaborate."
    >
      <div className="space-y-6 text-white/80">
        <section>
          <h2 className="text-lg font-semibold text-white">Why it exists</h2>
          <p className="mt-2">
            Creative work is easier when you have an audience, a community and people to ask for help. CreativesSelect gives you
            all three in one place: a profile that looks like you, a feed and groups to talk in, and a board where you can ask
            for a hand or offer yours.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">Who it&apos;s for</h2>
          <p className="mt-2">
            Anyone making things — whether you&apos;re posting your first sketch or sharing a finished album. Use it to build a
            portfolio, find collaborators, get feedback, or just keep up with other creatives.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white">You&apos;re in control</h2>
          <p className="mt-2">
            Profiles can be public or private, you can block or report anyone, and you can delete your account and everything
            you made at any time. Your email is never shown to other people.
          </p>
        </section>

        <p className="text-sm text-white/50">
          CreativesSelect is a student-built capstone project. Explore the <Link to="/features" className="text-violet-400 hover:underline">features</Link> or
          see <Link to="/how-it-works" className="text-violet-400 hover:underline">how it works</Link>.
        </p>
      </div>
    </InfoPage>
  );
}
