import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "../common/Logo";
import { turnOffThisDevice } from "../../lib/push";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../api/auth.api";
import { Avatar } from "../common/Avatar";
import { NotificationBell } from "./NotificationBell";
import { MessagesLink } from "./MessagesLink";
import { ShareButton } from "../share/ShareButton";
import { siteUrl } from "../../lib/share";
import { t, type Key } from "../../i18n";

const NAV_LINKS: { to: string; label: Key }[] = [
  { to: "/", label: "nav.feed" },
  { to: "/friends", label: "nav.friends" },
  { to: "/groups", label: "nav.groups" },
  { to: "/events", label: "nav.events" },
  { to: "/search", label: "nav.search" },
  { to: "/live", label: "nav.live" },
  { to: "/help-wanted", label: "nav.helpWanted" },
  { to: "/explore", label: "nav.explore" },
];

export function NavBar() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    try {
      // stop this device getting the account's notifications (this needs the session, so it comes first)
      await turnOffThisDevice();
      await authApi.logout();
    } catch {
      // The server call failed (e.g. offline). The user still gets logged out on
      // this device below; the session cookie just expires on its own.
    } finally {
      // Always clear client-side session state, even if the server call
      // failed (e.g. a network blip) -- from the user's perspective,
      // clicking "Log out" should never leave them stuck logged in.
      setUser(null);
      navigate("/login");
    }
  }

  return (
    <nav className="sticky top-0 z-20 border-b border-white/10 bg-[#0e0e12]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="shrink-0" onClick={() => setMenuOpen(false)}>
          <Logo height={26} />
        </Link>

        {user ? (
          <>
            {/* The full row is for wide viewports (1280px and up): with every link, the messages link and the person's own name it
                needs about 1050px, so anything narrower gets the dropdown below rather than links that wrap or crowd each other. */}
            <div className="hidden items-center gap-3 text-sm xl:flex">
              {NAV_LINKS.map((link) => (
                <Link key={link.to} to={link.to} className="whitespace-nowrap text-white/70 hover:text-white">
                  {t(link.label)}
                </Link>
              ))}
              <MessagesLink className="whitespace-nowrap text-white/70 hover:text-white" />
              {user.isAdmin && (
                <Link to="/admin/moderation" className="whitespace-nowrap text-amber-300 hover:text-amber-200">
                  {t("nav.moderation")}
                </Link>
              )}
              <NotificationBell />
              <Link to={`/u/${user.username}`} className="flex items-center gap-2 whitespace-nowrap text-white/90 hover:text-white">
                <Avatar username={user.username} displayName={user.displayName} avatarUrl={user.avatarUrl} size={28} />
                <span className="max-w-[9rem] truncate">{user.displayName}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="whitespace-nowrap rounded-md border border-white/15 px-3 py-1 text-white/70 hover:bg-white/10 hover:text-white"
              >
                {t("nav.logOut")}
              </button>
            </div>

            {/* Compact controls on narrow viewports -- the full row above
                doesn't fit, so links move into a toggled dropdown instead
                of silently overflowing off-screen. */}
            <div className="flex items-center gap-2 xl:hidden">
              <NotificationBell />
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={t("nav.menu")}
                aria-expanded={menuOpen}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
              >
                {menuOpen ? "✕" : "☰"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 text-sm">
            <Link to="/login" className="text-white/70 hover:text-white">
              {t("common.logIn")}
            </Link>
            <Link to="/register" className="rounded-md bg-violet-600 px-3 py-1.5 font-medium text-white hover:bg-violet-500">
              {t("common.signUp")}
            </Link>
          </div>
        )}
      </div>

      {user && menuOpen && (
        <div className="space-y-1 border-t border-white/10 px-4 py-3 text-sm xl:hidden">
          <Link
            to={`/u/${user.username}`}
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-white/90 hover:bg-white/10"
          >
            <Avatar username={user.username} displayName={user.displayName} avatarUrl={user.avatarUrl} size={28} />
            {user.displayName}
          </Link>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className="block rounded-md px-2 py-2 text-white/70 hover:bg-white/10 hover:text-white"
            >
              {t(link.label)}
            </Link>
          ))}
          {user.isAdmin && (
            <Link to="/admin/moderation" onClick={() => setMenuOpen(false)} className="block rounded-md px-2 py-2 text-amber-300 hover:bg-white/10">
              {t("nav.moderation")}
            </Link>
          )}
          <MessagesLink
            onClick={() => setMenuOpen(false)}
            className="block rounded-md px-2 py-2 text-white/70 hover:bg-white/10 hover:text-white"
          />
          <ShareButton
            url={siteUrl}
            title={t("nav.shareTitle")}
            description={t("nav.shareDescription")}
            className="block w-full rounded-md px-2 py-2 text-start text-white/70 hover:bg-white/10 hover:text-white"
          >
            {t("nav.shareSite")}
          </ShareButton>
          <button
            onClick={() => {
              setMenuOpen(false);
              handleLogout();
            }}
            className="block w-full rounded-md px-2 py-2 text-start text-white/70 hover:bg-white/10 hover:text-white"
          >
            {t("nav.logOut")}
          </button>
        </div>
      )}
    </nav>
  );
}
