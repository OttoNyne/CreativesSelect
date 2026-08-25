import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { profilesApi } from "../api/profiles.api";
import { friendsApi } from "../api/friends.api";
import { moderationApi } from "../api/moderation.api";
import { uploadFile } from "../api/media.api";
import { assetUrl, ApiError } from "../api/client";
import type { User, ProfileTheme } from "../types";
import { profileThemeStyle } from "../theme/applyProfileTheme";
import { Avatar } from "../components/common/Avatar";
import { ImagePositioner } from "../components/common/ImagePositioner";
import { ThemeEditor } from "../components/profile/ThemeEditor";
import { TopFriendsList } from "../components/profile/TopFriendsList";
import { ProfileComments } from "../components/profile/ProfileComments";
import { PortfolioGrid } from "../components/profile/PortfolioGrid";
import { MusicPlayer } from "../components/profile/MusicPlayer";
import { GenerateTextButton } from "../components/ai/GenerateTextButton";
import { GenerateImageButton } from "../components/ai/GenerateImageButton";

export function ProfilePage() {
  const { username = "" } = useParams();
  const { user: viewer, setUser: setViewer } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [theme, setTheme] = useState<ProfileTheme>({});
  const [isFriend, setIsFriend] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [liveWallpaper, setLiveWallpaper] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);

  const isOwner = viewer?.username === username;

  useEffect(() => {
    setNotFound(false);
    profilesApi
      .get(username)
      .then(({ user }) => {
        setProfile(user);
        setBio(user.bio ?? "");
        setTheme(user.theme);
      })
      .catch(() => setNotFound(true));

    if (viewer && viewer.username !== username) {
      friendsApi.list().then(({ friends }) => setIsFriend(friends.some((f) => f.username === username)));
    }
  }, [username, viewer]);

  async function saveProfile(updates: Parameters<typeof profilesApi.updateMe>[0]) {
    setSaving(true);
    try {
      const { user } = await profilesApi.updateMe(updates);
      setProfile(user);
      if (isOwner) setViewer(user);
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { url } = await uploadFile(file, "avatars");
    await saveProfile({ avatarUrl: url });
  }

  async function handleBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { url } = await uploadFile(file, "banners");
    await saveProfile({ bannerUrl: url });
  }

  async function handleWallpaperFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { url } = await uploadFile(file, "wallpapers");
    const wallpaperType = file.type.startsWith("video/") ? "video" : "image";
    await saveProfile({ wallpaperUrl: url, wallpaperType, wallpaperPosition: "50% 50%" });
  }

  async function handleFriendRequest() {
    try {
      await friendsApi.request(username);
      setRequestSent(true);
    } catch (err) {
      if (err instanceof ApiError) alert(err.message);
    }
  }

  async function handleBlock() {
    if (!confirm(`Block @${username}? They won't be able to friend, comment, or interact with you.`)) return;
    await moderationApi.block(username);
    alert("User blocked.");
  }

  async function handleReport() {
    const reason = prompt("What's the issue with this profile?");
    if (!reason) return;
    await moderationApi.report("user", profile!.id, reason);
    alert("Report submitted. Thanks for helping keep this space safe.");
  }

  if (notFound) {
    return <div className="p-8 text-center text-white/50">This profile is unavailable or private.</div>;
  }

  if (!profile) {
    return <div className="p-8 text-center text-white/50">Loading profile…</div>;
  }

  const wallpaperUrl = assetUrl(profile.wallpaperUrl);
  const isVideoWallpaper = profile.wallpaperType === "video" && Boolean(wallpaperUrl);

  return (
    <div
      style={profileThemeStyle(
        profile.theme,
        isVideoWallpaper ? undefined : wallpaperUrl,
        profile.wallpaperPosition,
      )}
      className="min-h-[calc(100vh-56px)]"
    >
      {isVideoWallpaper && (
        <>
          <video
            src={wallpaperUrl}
            style={{ objectPosition: profile.wallpaperPosition }}
            className="fixed inset-0 -z-10 h-full w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          />
          <div className="fixed inset-0 -z-10 bg-black/40" />
        </>
      )}

      <div className={`relative w-full bg-black/30 ${editing && isOwner && profile.bannerUrl ? "" : "h-48 overflow-hidden"}`}>
        {editing && isOwner && profile.bannerUrl ? (
          <ImagePositioner
            src={assetUrl(profile.bannerUrl)!}
            mediaType="image"
            position={profile.bannerPosition}
            onCommit={(bannerPosition) => saveProfile({ bannerPosition })}
            heightClass="h-48"
          />
        ) : (
          profile.bannerUrl && (
            <img
              src={assetUrl(profile.bannerUrl)}
              alt=""
              style={{ objectPosition: profile.bannerPosition }}
              className="h-full w-full object-cover"
            />
          )
        )}
        {isOwner && (
          <button
            onClick={() => bannerInputRef.current?.click()}
            className="absolute bottom-2 right-2 rounded-md bg-black/60 px-3 py-1 text-xs text-white"
          >
            Change banner
          </button>
        )}
        <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerFile} />
      </div>

      <div className="mx-auto max-w-3xl px-4">
        <div className="-mt-10 flex items-end gap-4">
          <div className="relative">
            <Avatar
              username={profile.username}
              displayName={profile.displayName}
              avatarUrl={profile.avatarUrl}
              size={88}
              className="border-4 border-[var(--profile-bg)]"
            />
            {isOwner && (
              <button
                onClick={() => avatarInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
              >
                Edit
              </button>
            )}
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
          </div>

          <div className="pb-2">
            <h1 className="text-2xl font-bold">{profile.displayName}</h1>
            <p className="text-sm opacity-60">@{profile.username}</p>
          </div>

          <div className="ml-auto flex gap-2 pb-2">
            {isOwner ? (
              <button
                onClick={() => setEditing((e) => !e)}
                className="rounded-md border px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--profile-accent)" }}
              >
                {editing ? "Done editing" : "Edit profile"}
              </button>
            ) : viewer ? (
              <>
                {isFriend ? (
                  <span className="rounded-md bg-white/10 px-3 py-1.5 text-sm">✓ Friends</span>
                ) : (
                  <button
                    onClick={handleFriendRequest}
                    disabled={requestSent}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: "var(--profile-accent)" }}
                  >
                    {requestSent ? "Request sent" : "Add Friend"}
                  </button>
                )}
                <button onClick={handleReport} className="rounded-md border border-white/20 px-3 py-1.5 text-sm">
                  Report
                </button>
                <button onClick={handleBlock} className="rounded-md border border-white/20 px-3 py-1.5 text-sm">
                  Block
                </button>
              </>
            ) : null}
          </div>
        </div>

        {editing && isOwner ? (
          <div className="mt-4 space-y-3">
            <ThemeEditor theme={theme} onChange={setTheme} />
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Tell people what you make…"
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm placeholder:opacity-40 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <GenerateTextButton kind="bio" getPrompt={() => bio || profile.displayName} onGenerated={setBio} />
              <GenerateImageButton
                kind="banner"
                getPrompt={() => bio}
                onGenerated={(url) => saveProfile({ bannerUrl: url, bannerPosition: "50% 50%" })}
                label="Generate banner"
              />
              <label className="ml-auto flex items-center gap-2 text-sm opacity-70">
                <input
                  type="checkbox"
                  checked={profile.isPrivate}
                  onChange={(e) => saveProfile({ isPrivate: e.target.checked })}
                />
                Private profile
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => wallpaperInputRef.current?.click()}
                className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
              >
                🖼️ Change wallpaper
              </button>
              <input
                ref={wallpaperInputRef}
                type="file"
                accept="image/*,video/mp4,video/webm"
                className="hidden"
                onChange={handleWallpaperFile}
              />
              <GenerateImageButton
                kind="wallpaper"
                getPrompt={() => bio}
                live={liveWallpaper}
                onGenerated={(url) =>
                  saveProfile({ wallpaperUrl: url, wallpaperType: "image", wallpaperPosition: "50% 50%" })
                }
                label="Generate wallpaper"
              />
              <label className="flex items-center gap-1.5 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={liveWallpaper}
                  onChange={(e) => setLiveWallpaper(e.target.checked)}
                />
                Live (animated)
              </label>
              {profile.wallpaperUrl && (
                <button
                  type="button"
                  onClick={() => saveProfile({ wallpaperUrl: null })}
                  className="text-xs text-white/40 hover:text-red-400"
                >
                  Remove wallpaper
                </button>
              )}
            </div>
            {profile.wallpaperUrl && (
              <ImagePositioner
                src={wallpaperUrl!}
                mediaType={profile.wallpaperType}
                position={profile.wallpaperPosition}
                onCommit={(wallpaperPosition) => saveProfile({ wallpaperPosition })}
                heightClass="h-32"
              />
            )}
            <button
              onClick={() => saveProfile({ bio, theme })}
              disabled={saving}
              className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--profile-accent)" }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm opacity-80">{profile.bio || "No bio yet."}</p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 pb-10 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TopFriendsList username={profile.username} isOwner={isOwner} />
          </div>
          <div className="sm:col-span-2">
            <MusicPlayer username={profile.username} isOwner={isOwner} />
          </div>
          <div className="sm:col-span-2">
            <PortfolioGrid username={profile.username} isOwner={isOwner} />
          </div>
          <div className="sm:col-span-2">
            <ProfileComments username={profile.username} />
          </div>
        </div>
      </div>
    </div>
  );
}
