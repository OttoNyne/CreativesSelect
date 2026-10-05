import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "../common/Logo";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../api/auth.api";
import { Avatar } from "../common/Avatar";
import { NotificationBell } from "./NotificationBell";
import { MessagesLink } from "./MessagesLink";
import { ShareButton } from "../share/ShareButton";
import { siteUrl } from "../../lib/share";

const NAV_LINKS = [
  { to: "/", label: "Feed" },
  { to: "/friends", label: "Friends" },
  { to: "/groups", label: "Groups" },
  { to: "/events", label: "Events" },
  { to: "/search", label: "Search" },
  { to: "/live", label: "Live" },
  { to: "/help-wanted", label: "Help wanted" },
];

export function NavBar() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    try {
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
                  {link.label}
                </Link>
              ))}
              <MessagesLink className="whitespace-nowrap text-white/70 hover:text-white" />
              {user.isAdmin && (
                <Link to="/admin/moderation" className="whitespace-nowrap text-amber-300 hover:text-amber-200">
                  Moderation
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
                Log out
              </button>
            </div>

            {/* Compact controls on narrow viewports -- the full row above
                doesn't fit, so links move into a toggled dropdown instead
                of silently overflowing off-screen. */}
            <div className="flex items-center gap-2 xl:hidden">
              <NotificationBell />
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Menu"
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
              Log in
            </Link>
            <Link to="/register" className="rounded-md bg-violet-600 px-3 py-1.5 font-medium text-white hover:bg-violet-500">
              Sign up
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
              {link.label}
            </Link>
          ))}
          {user.isAdmin && (
            <Link to="/admin/moderation" onClick={() => setMenuOpen(false)} className="block rounded-md px-2 py-2 text-amber-300 hover:bg-white/10">
              Moderation
            </Link>
          )}
          <MessagesLink
            onClick={() => setMenuOpen(false)}
            className="block rounded-md px-2 py-2 text-white/70 hover:bg-white/10 hover:text-white"
          />
          <ShareButton
            url={siteUrl}
            title="Share CreativesSelect"
            description="Anyone who scans this code, or opens the link, lands on the site."
            className="block w-full rounded-md px-2 py-2 text-left text-white/70 hover:bg-white/10 hover:text-white"
          >
            Share this site
          </ShareButton>
          <button
            onClick={() => {
              setMenuOpen(false);
              handleLogout();
            }}
            className="block w-full rounded-md px-2 py-2 text-left text-white/70 hover:bg-white/10 hover:text-white"
          >
            Log out
          </button>
        </div>
      )}
    </nav>
  );
}
