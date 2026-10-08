import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { profilesApi } from "../api/profiles.api";
import { friendsApi } from "../api/friends.api";
import { moderationApi } from "../api/moderation.api";
import { uploadFile } from "../api/media.api";
import { assetUrl, ApiError } from "../api/client";
import type { User, ProfileTheme } from "../types";
import { ShareButton } from "../components/share/ShareButton";
import { ThemedPage } from "../components/layout/ThemedPage";
import { WIDTH_CLASS, styleValue, themeToSave } from "../lib/profileStyle";
import { motionOf } from "../lib/wallpaperMotion";
import { WallpaperStudio } from "../components/profile/WallpaperStudio";
import { ProfileMood, ProfileTags } from "../components/profile/ProfileStatus";
import { StatusEditor, TagEditor } from "../components/profile/StatusEditor";
import { profileUrl } from "../lib/share";
import { Avatar } from "../components/common/Avatar";
import { ImagePositioner } from "../components/common/ImagePositioner";
import { ThemeEditor } from "../components/profile/ThemeEditor";
import { TopFriendsList } from "../components/profile/TopFriendsList";
import { AboutMe } from "../components/profile/AboutMe";
import { MutualFriends } from "../components/profile/MutualFriends";
import { ProfileComments } from "../components/profile/ProfileComments";
import { PortfolioGrid } from "../components/profile/PortfolioGrid";
import { MusicPlayer } from "../components/profile/MusicPlayer";
import { ProfileBlog } from "../components/profile/ProfileBlog";
import { ActivityBadge } from "../components/common/ActivityBadge";
import { ProfileVisitors } from "../components/profile/ProfileVisitors";
import { profileViewsApi } from "../api/profileViews.api";
import { SectionFrame } from "../components/profile/SectionFrame";
import { hiddenOf, moveSection, orderOf, type SectionKey } from "../lib/sections";
import { GenerateTextButton } from "../components/ai/GenerateTextButton";
import { ImageSearchPicker } from "../components/ai/ImageSearchPicker";
import { DeleteAccount } from "../components/profile/DeleteAccount";
import { ChangePassword } from "../components/profile/ChangePassword";
import { SignedInDevices } from "../components/profile/SignedInDevices";
import { TwoFactorSettings } from "../components/profile/TwoFactorSettings";
import { PasskeysSettings } from "../components/profile/PasskeysSettings";
import { DownloadMyData } from "../components/profile/DownloadMyData";
import { ChangeEmail } from "../components/profile/ChangeEmail";
import { EmailStatus } from "../components/profile/EmailStatus";
import { PushSettings } from "../components/profile/PushSettings";
import { ProfileNames } from "../components/profile/ProfileNames";
import { CSBadge } from "../components/common/CSBadge";

export function ProfilePage() {
  const { username = "" } = useParams();
  const { user: viewer, setUser: setViewer } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<User | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [searchParams] = useSearchParams();
  const [bio, setBio] = useState("");
  const [mood, setMood] = useState("");
  const [listeningTo, setListeningTo] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [theme, setTheme] = useState<ProfileTheme>({});
  const [isFriend, setIsFriend] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);

  const isOwner = viewer?.username === username;

  useEffect(() => {
    // Ignore the result of a request once we've moved on to a different profile.
    // (Renaming yourself briefly leaves this effect running for the OLD address,
    // which is now a 404 — without this, that late 404 could overwrite the new,
    // already-loaded profile with "unavailable".)
    let cancelled = false;
    setNotFound(false);
    profilesApi
      .get(username)
      .then(({ user }) => {
        if (cancelled) return;
        setProfile(user);
        setBio(user.bio ?? "");
        setMood(user.mood ?? "");
        setListeningTo(user.listeningTo ?? "");
        setTags(user.tags ?? []);
        setTheme(user.theme);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });

    if (viewer && viewer.username !== username) {
      friendsApi
        .list()
        .then(({ friends }) => {
          if (!cancelled) setIsFriend(friends.some((f) => f.username === username));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // Only re-fetch when navigating to a different profile or the logged-in
    // identity changes — not on every field-level update to `viewer` (e.g.
    // saveProfile() calling setViewer() after an isPrivate/avatar auto-save),
    // which would otherwise wipe out unsaved bio/theme edits in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, viewer?.username]);

  // Opening someone else's profile counts as a visit, but only if you have profile views on (the server also needs them to).
  const recordsVisits = Boolean(viewer?.profileViews) && !isOwner && profile?.username === username;
  useEffect(() => {
    if (recordsVisits) profileViewsApi.record(username).catch(() => {}); // a missed visit isn't worth an error
  }, [recordsVisits, username]);

  // A link such as the getting-started checklist's "Add a profile picture" opens the owner's own profile ready to edit.
  const wantsEdit = isOwner && searchParams.get("edit") === "1";
  useEffect(() => {
    if (wantsEdit) setEditing(true);
  }, [wantsEdit]);

  /** Saves the change; says so (and returns false) if it couldn't. */
  async function saveProfile(updates: Parameters<typeof profilesApi.updateMe>[0]): Promise<boolean> {
    setSaving(true);
    try {
      const { user } = await profilesApi.updateMe(updates);
      setProfile(user);
      if (isOwner) setViewer(user);
      return true;
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't save that change.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { url } = await uploadFile(file, "avatars");
      await saveProfile({ avatarUrl: url });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't upload that image.");
    }
  }

  async function handleWallpaperFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { url } = await uploadFile(file, "wallpapers");
      const wallpaperType = file.type.startsWith("video/") ? "video" : "image";
      await saveProfile({ wallpaperUrl: url, wallpaperType, wallpaperPosition: "50% 50%" });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't upload that file.");
    }
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
    try {
      await moderationApi.block(username);
      alert("User blocked.");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't block that user.");
    }
  }

  async function handleReport() {
    const reason = prompt("What's the issue with this profile?");
    if (!reason) return;
    try {
      await moderationApi.report("user", profile!.id, reason);
      alert("Report submitted. Thanks for helping keep this space safe.");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't submit that report.");
    }
  }

  if (notFound) {
    return <div className="p-8 text-center text-white/60">This profile is unavailable or private.</div>;
  }

  if (!profile) {
    return <div className="p-8 text-center text-white/60">Loading profile…</div>;
  }

  // The sections below the introduction, in the owner's order. While editing the owner sees every one (with controls); everyone else,
  // and the owner outside editing, sees only the ones that aren't hidden.
  const order = orderOf(profile);
  const hidden = hiddenOf(profile);
  const rearranging = isOwner && editing;
  const sectionBody = (key: SectionKey) => {
    switch (key) {
      case "about":
        return <AboutMe username={profile.username} isOwner={isOwner} />;
      case "friends":
        return <TopFriendsList username={profile.username} isOwner={isOwner} />;
      case "music":
        return <MusicPlayer username={profile.username} isOwner={isOwner} />;
      case "portfolio":
        return <PortfolioGrid username={profile.username} isOwner={isOwner} focusPiece={searchParams.get("piece")} focusComment={searchParams.get("comment")} />;
      case "blog":
        return <ProfileBlog username={profile.username} isOwner={isOwner} />;
      case "testimonials":
        return <ProfileComments username={profile.username} />;
    }
  };

  const wallpaperUrl = assetUrl(profile.wallpaperUrl);
  // while the owner is editing, the page shows the style as it is being changed, before it is saved
  const look = editing ? { ...profile, theme } : profile;
  const motion = motionOf(profile.wallpaperMotion);

  return (
    <ThemedPage look={look} contentClassName={`mx-auto ${WIDTH_CLASS[styleValue(look.theme, "width")]} px-4 pt-8`} panelClassName="min-h-[calc(100vh-56px)] pb-6 sm:rounded-b-2xl">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="relative">
          <Avatar
            username={profile.username}
            displayName={profile.displayName}
            avatarUrl={profile.avatarUrl}
            size={88}
            className="profile-avatar border-4 border-[var(--profile-bg)]"
          />
          {isOwner && (
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="absolute -bottom-1 -end-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
            >
              Edit
            </button>
          )}
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
        </div>

        <div className="min-w-0 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words text-2xl font-bold">{profile.displayName}</h1>
            <CSBadge verified={profile.csVerified} size={22} withLabel />
          </div>
          <p className="text-sm text-[var(--profile-muted)]">@{profile.username}</p>
          <ActivityBadge activity={profile.activity} className="text-[var(--profile-muted)]" />
          <ProfileMood mood={profile.mood} listeningTo={profile.listeningTo} />
        </div>

        <div className="ms-auto flex flex-wrap gap-2 pb-2">
          <ShareButton
            url={() => profileUrl(profile.username)}
            title={isOwner ? "Share your profile" : `Share ${profile.displayName}'s profile`}
            description="Scan the code, or send the link, to open this profile."
            className="rounded-md border border-white/20 px-3 py-1.5 text-sm"
          >
            Share
          </ShareButton>
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
                <>
                  <span className="rounded-md bg-white/10 px-3 py-1.5 text-sm">✓ Friends</span>
                  <Link to={`/messages/${username}`} className="rounded-md border border-white/20 px-3 py-1.5 text-sm">
                    Message
                  </Link>
                </>
              ) : (
                <button
                  onClick={handleFriendRequest}
                  disabled={requestSent}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--profile-on-accent)] disabled:opacity-50"
                  style={{ background: "var(--profile-accent-fill)" }}
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
          <ProfileNames
            key={profile.username}
            profile={profile}
            onChanged={(updated) => {
              setProfile(updated);
              if (isOwner) setViewer(updated);
              // A new username is a new address: move to it.
              if (updated.username !== username) navigate(`/u/${updated.username}`, { replace: true });
            }}
          />
          <ThemeEditor theme={theme} onChange={setTheme} hasWallpaper={Boolean(wallpaperUrl)} />
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Tell people what you make…"
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm placeholder:text-white/55 focus:outline-none"
          />
          <StatusEditor mood={mood} listeningTo={listeningTo} onMood={setMood} onListeningTo={setListeningTo} />
          <TagEditor tags={tags} onChange={setTags} />
          <div className="flex flex-wrap items-center gap-2">
            <GenerateTextButton kind="bio" getPrompt={() => bio || profile.displayName} onGenerated={setBio} />
            <label className="ms-auto flex items-center gap-2 text-sm text-[var(--profile-muted)]">
              <input
                type="checkbox"
                checked={profile.isPrivate}
                onChange={(e) => saveProfile({ isPrivate: e.target.checked })}
              />
              Private profile
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--profile-muted)]">
              <input type="checkbox" checked={profile.showActivity !== false} onChange={(e) => saveProfile({ showActivity: e.target.checked })} />
              Show my friends when I&apos;m online
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--profile-muted)]">
              <input type="checkbox" checked={profile.profileViews === true} onChange={(e) => saveProfile({ profileViews: e.target.checked })} />
              Profile views
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--profile-muted)]">
              <input type="checkbox" checked={profile.chatStatus !== false} onChange={(e) => saveProfile({ chatStatus: e.target.checked })} />
              Show friends when I&apos;ve read their messages and when I&apos;m typing
            </label>
            <p className="w-full text-xs text-[var(--profile-muted)]">
              On: a friend sees &quot;Seen&quot; under their message once you open the chat, and &quot;typing…&quot; while you write. Off: they see neither, and you don&apos;t see theirs. Either of you turning it off turns it off for both.
            </p>
            <label className="flex items-center gap-2 text-sm text-[var(--profile-muted)]">
              <input type="checkbox" checked={profile.showConnections !== false} onChange={(e) => saveProfile({ showConnections: e.target.checked })} />
              Show who I know to friends of friends
            </label>
            <p className="w-full text-xs text-[var(--profile-muted)]">
              On: you can be named as a mutual friend and suggested as someone people may know. Off: neither, and your friends aren&apos;t suggested through you.
            </p>
            <p className="w-full text-xs text-[var(--profile-muted)]">
              Off by default. Turn on to see who visits your profile; you then show up to other people who have it on when you visit theirs. Turning it off deletes
              every visit.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/60">Avatar:</span>
            <ImageSearchPicker
              label="🔍 Search photos for avatar"
              onSelect={(url) => saveProfile({ avatarUrl: url })}
            />
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
            {profile.wallpaperUrl && (
              <button
                type="button"
                onClick={() => saveProfile({ wallpaperUrl: null })}
                className="text-xs text-white/60 hover:text-red-400"
              >
                Remove wallpaper
              </button>
            )}
          </div>
          <WallpaperStudio
            hasWallpaper={Boolean(profile.wallpaperUrl)}
            isPicture={profile.wallpaperType !== "video"}
            motion={motion}
            onMotionChange={(next) => void saveProfile({ wallpaperMotion: next })}
            onUse={async (url, next) => {
              const saved = await saveProfile({ wallpaperUrl: url, wallpaperType: "image", wallpaperPosition: "50% 50%", wallpaperMotion: next });
              if (!saved) throw new Error("not saved");
            }}
          />
          <ImageSearchPicker
            label="🔍 Search photos for wallpaper"
            onSelect={(url) =>
              saveProfile({ wallpaperUrl: url, wallpaperType: "image", wallpaperPosition: "50% 50%" })
            }
          />
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
            onClick={() => saveProfile({ bio, theme: themeToSave(theme), mood, listeningTo, tags })}
            disabled={saving}
            className="rounded-md px-4 py-1.5 text-sm font-medium text-[var(--profile-on-accent)] disabled:opacity-50"
            style={{ background: "var(--profile-accent-fill)" }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <div className="space-y-3 border-t border-white/10 pt-3">
            <EmailStatus />
            <ChangeEmail />
            <PushSettings />
            <PasskeysSettings />
            <TwoFactorSettings />
            <SignedInDevices />
            <ChangePassword />
            <DownloadMyData />
            <DeleteAccount />
          </div>
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm">{profile.bio || "No bio yet."}</p>
          <ProfileTags tags={profile.tags} />
        </>
      )}

      {viewer && !isOwner && <MutualFriends username={profile.username} />}

      {isOwner && viewer?.profileViews && <ProfileVisitors />}

      <div className="profile-sections mt-6 flex flex-col gap-4 pb-10">
        {order
          .filter((key) => rearranging || !hidden.includes(key))
          .map((key, i, shown) => {
            const section = sectionBody(key);
            return rearranging ? (
              <SectionFrame
                key={key}
                section={key}
                position={i + 1}
                total={shown.length}
                hidden={hidden.includes(key)}
                disabled={saving}
                onMove={(direction) => saveProfile({ sectionOrder: moveSection(order, key, direction) })}
                onToggleHidden={() => saveProfile({ hiddenSections: hidden.includes(key) ? hidden.filter((h) => h !== key) : [...hidden, key] })}
              >
                {section}
              </SectionFrame>
            ) : (
              <div key={key}>{section}</div>
            );
          })}
      </div>
    </ThemedPage>
  );
}
