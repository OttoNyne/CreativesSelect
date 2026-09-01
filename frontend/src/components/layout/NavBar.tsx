import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../api/auth.api";
import { Avatar } from "../common/Avatar";
import { NotificationBell } from "./NotificationBell";

export function NavBar() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await authApi.logout();
    setUser(null);
    navigate("/login");
  }

  return (
    <nav className="sticky top-0 z-20 border-b border-white/10 bg-[#0e0e12]/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-bold tracking-tight text-violet-400">
          CreativesSelect
        </Link>

        {user ? (
          <div className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-white/70 hover:text-white">
              Feed
            </Link>
            <Link to="/friends" className="text-white/70 hover:text-white">
              Friends
            </Link>
            <Link to="/groups" className="text-white/70 hover:text-white">
              Groups
            </Link>
            <Link to="/search" className="text-white/70 hover:text-white">
              Search
            </Link>
            <NotificationBell />
            <Link to={`/u/${user.username}`} className="flex items-center gap-2 text-white/90 hover:text-white">
              <Avatar username={user.username} displayName={user.displayName} avatarUrl={user.avatarUrl} size={28} />
              {user.displayName}
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-md border border-white/15 px-3 py-1 text-white/70 hover:bg-white/10 hover:text-white"
            >
              Log out
            </button>
          </div>
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
    </nav>
  );
}
