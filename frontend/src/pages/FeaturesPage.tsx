import { InfoPage } from "../components/layout/InfoPage";

const FEATURES = [
  { icon: "🎨", title: "A profile that's yours", text: "Pick your colours, fonts and wallpaper, add a bio, show your top friends, share your mood and what you're listening to, tag what you do, write blog entries, collect testimonials, and arrange or hide the parts of your page. Describe a wallpaper (or start from one of your photos) and let AI make it, then choose how it moves. Any AI picture on the site can start from a reference photo of your own." },
  { icon: "🖼️", title: "Portfolio", text: "Show pictures and short videos (up to 30 seconds). Visitors can like or dislike each piece." },
  { icon: "🎵", title: "Music", text: "Add up to five tracks — YouTube links or your own uploads — arrange them in the order you like, and they keep playing as you browse." },
  { icon: "📝", title: "Feed", text: "Share what you're working on with a picture you can frame: choose its shape, zoom and placement before posting." },
  { icon: "💬", title: "Messages and group chat", text: "Chat privately with friends, or talk with everyone in a group you've joined." },
  { icon: "👥", title: "Friends and groups", text: "Find other creatives, send friend requests, join or start groups around what you love, and post a bulletin to all your friends at once." },
  { icon: "🤝", title: "Help wanted", text: "Post a request on the public board, or offer to help someone else with theirs." },
  { icon: "🎙️", title: "Live audio", text: "Go live with your voice, chat with listeners as you talk, bring up to 9 listeners on stage to speak, let your friends know you're on, and schedule one ahead so people can ask for a reminder. Find other creatives by name or tag. Share a live, a profile or the whole site with a QR code." },
  { icon: "✨", title: "AI assistance", text: "Optionally generate a caption or an image to get started. Anything AI-made is clearly labelled." },
  { icon: "🔒", title: "Privacy and safety", text: "Private profiles, blocking, reporting, email confirmation, password reset, and full account deletion." },
  { icon: "📱", title: "Works on your phone", text: "Use it in any browser, or add it to your Home Screen to open it like an app." },
];

export function FeaturesPage() {
  return (
    <InfoPage title="Features" intro="Everything you get with one account.">
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
