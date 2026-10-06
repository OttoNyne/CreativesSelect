import { InfoPage } from "../components/layout/InfoPage";

const FEATURES = [
  { icon: "🎨", title: "A profile that's yours", text: "Pick your colours, one of ten fonts and a wallpaper, start from a ready-made look (Minimal, Classic, Gallery or Journal) and tweak the boxes, corners, spacing, headings, picture shape and page width, add a bio, fill in an About me (interests, favourite music, films and books, who you'd like to meet, and an optional place and birthday that only you choose to share), show your top friends, share your mood and what you're listening to, tag what you do, write blog entries that others can comment on, collect testimonials, and arrange or hide the parts of your page. Describe a wallpaper (or start from one of your photos) and let AI make it, then choose how it moves. Any AI picture on the site can start from a reference photo of your own. Earn the CSverified badge with 1,000 active friends (or be given it by the site's administrators). New here? A short checklist on your feed helps you get set up." },
  { icon: "🖼️", title: "Portfolio", text: "Show pictures and short videos (up to 30 seconds). Give each piece a caption (as you add it, or any time after), and group your pieces into named albums. Visitors can react to each piece (and to your posts) with an emoji, and talk about it in comments, which can hold a picture or GIF and links." },
  { icon: "🎵", title: "Music", text: "Add up to twenty tracks — YouTube links, or up to five of your own uploads — name the artist, arrange them in the order you like, choose one as your profile song, and they keep playing as you browse. You can see how many people have played each." },
  { icon: "📝", title: "Feed", text: "Share what you're working on with a picture you can frame: choose its shape, zoom and placement before posting. Fix a typo afterwards — anything you change is marked (edited) — and scroll back through older posts a page at a time. Your feed wears the same background as your profile." },
  { icon: "💬", title: "Messages and group chat", text: "Chat privately with friends, or talk with everyone in a group you've joined." },
  { icon: "👥", title: "Friends and groups", text: "Search for people (those you share friends with come first), blog entries, groups, group topics and Help wanted requests, see the friends you share and people you may know, send friend requests, invite a friend with a link or QR code, join or start groups around what you love and keep topics going on each group's board, post a bulletin to all your friends at once, plan an event and see who is going, and see which friends are online." },
  { icon: "🤝", title: "Help wanted", text: "Post a request on the public board, or offer to help someone else with theirs." },
  { icon: "🎙️", title: "Live audio", text: "Go live with your voice, chat with listeners as you talk, bring up to 9 listeners on stage to speak, let your friends know you're on, and schedule one ahead so people can ask for a reminder. Find other creatives by name or tag. Share a live, a profile or the whole site with a QR code." },
  { icon: "✨", title: "AI assistance", text: "Optionally generate a caption or an image to get started. Anything AI-made is clearly labelled." },
  { icon: "🔒", title: "Privacy and safety", text: "Private profiles, blocking, reporting (reports are reviewed by the site's moderators), a switch to hide when you're online from friends, optional profile views that only work when both people turn them on, email confirmation, password reset, and full account deletion." },
  { icon: "📱", title: "Works on your phone", text: "Use it in any browser, or add it to your Home Screen to open it like an app. Turn on notifications in your settings to hear about messages, friend requests and comments even when the site is closed." },
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
