import { useEffect, useState } from "react";
import { ABOUT_FIELDS, ABOUT_LABELS, MAX_ABOUT, MAX_LOCATION, aboutApi, type AboutField } from "../../api/about.api";
import { ApiError } from "../../api/client";
import type { ProfileAbout } from "../../types";

// 2020 is a leap year, so 29 February is allowed; it is the only extra day a birthday can have.
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const monthName = (month: number) => new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(2020, month - 1, 1));
const birthdayText = (b: { month: number; day: number }) => new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(new Date(2020, b.month - 1, b.day));

const field =
  "w-full min-w-0 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/55 focus:border-[var(--profile-accent,#8b5cf6)] focus:outline-none";
const label = "block text-xs font-medium text-white/70";

const isEmpty = (about: ProfileAbout) => ABOUT_FIELDS.every((f) => !about.about[f]) && !about.location && !about.birthday;

/**
 * The About me part of a profile: interests, favourite music, films and books, who they'd like to meet, and (if they chose to share
 * them) a place and a birthday. Everything is drawn as plain text. Visitors see nothing if it is empty; the owner sees a prompt.
 */
export function AboutMe({ username, isOwner }: { username: string; isOwner: boolean }) {
  const [data, setData] = useState<ProfileAbout | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let current = true;
    aboutApi
      .get(username)
      .then((d) => current && setData(d))
      .catch(() => current && setFailed(true)); // e.g. a private profile: nothing to show
    return () => {
      current = false;
    };
  }, [username]);

  if (failed) return null;
  if (!data) return <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/60">Loading…</div>;
  if (!isOwner && isEmpty(data)) return null;

  return (
    <div className="profile-card rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <h2 className="profile-heading text-sm font-semibold uppercase tracking-wide text-white/60">About me</h2>
        {isOwner && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-[var(--profile-accent-text,#c4b5fd)] hover:underline">
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <AboutForm
          data={data}
          onSaved={(saved) => {
            setData(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : isEmpty(data) ? (
        <p className="mt-3 text-sm text-white/60">Tell people about yourself: your interests, favourite music, films and books, and who you'd like to meet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {(data.location || data.birthday) && (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/80">
              {data.location && <span>📍 {data.location}</span>}
              {data.birthday && <span>🎂 {birthdayText(data.birthday)}</span>}
            </p>
          )}
          {ABOUT_FIELDS.filter((f) => data.about[f]).map((f) => (
            <div key={f}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">{ABOUT_LABELS[f]}</h3>
              <p className="mt-0.5 whitespace-pre-line break-words text-sm text-white/80">{data.about[f]}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AboutForm({ data, onSaved, onCancel }: { data: ProfileAbout; onSaved: (about: ProfileAbout) => void; onCancel: () => void }) {
  const [texts, setTexts] = useState<Record<AboutField, string>>({ ...data.about });
  const [location, setLocation] = useState(data.location);
  const [audience, setAudience] = useState<"friends" | "everyone">(data.locationAudience ?? "friends");
  const [shareBirthday, setShareBirthday] = useState(Boolean(data.birthday));
  const [month, setMonth] = useState(data.birthday?.month ?? 1);
  const [day, setDay] = useState(data.birthday?.day ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (shareBirthday && day > DAYS_IN_MONTH[month - 1]) return setError(`${monthName(month)} doesn't have ${day} days`);
    setBusy(true);
    setError(null);
    try {
      onSaved(await aboutApi.save({ ...texts, location, locationAudience: audience, birthday: shareBirthday ? { month, day } : null }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Edit About me" className="mt-3 space-y-3">
      {ABOUT_FIELDS.map((f) => (
        <div key={f}>
          <label htmlFor={`about-${f}`} className={label}>
            {ABOUT_LABELS[f]}
          </label>
          <textarea id={`about-${f}`} value={texts[f]} onChange={(e) => setTexts((t) => ({ ...t, [f]: e.target.value }))} maxLength={MAX_ABOUT} rows={2} className={field} />
          <p className="text-end text-[10px] text-white/60">
            {texts[f].length} / {MAX_ABOUT}
          </p>
        </div>
      ))}

      <fieldset className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <legend className={label}>Where you are (optional)</legend>
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={MAX_LOCATION} placeholder="Leeds, England" aria-label="Location" className={field} />
        <select value={audience} onChange={(e) => setAudience(e.target.value as "friends" | "everyone")} aria-label="Who can see your location" className={field}>
          <option value="friends">My friends only</option>
          <option value="everyone">Everyone</option>
        </select>
      </fieldset>

      <fieldset>
        <legend className={label}>Birthday (optional)</legend>
        <label className="mt-1 flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" checked={shareBirthday} onChange={(e) => setShareBirthday(e.target.checked)} /> Show my birthday to my friends, and remind them
        </label>
        {shareBirthday && (
          <div className="mt-2 flex gap-2">
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Birthday month" className={field}>
              {DAYS_IN_MONTH.map((_, i) => (
                <option key={i} value={i + 1}>
                  {monthName(i + 1)}
                </option>
              ))}
            </select>
            <select value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="Birthday day" className={`${field} sm:w-24`}>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="mt-1 text-[11px] text-white/60">Only the month and day are kept, never a year or an age, and only your friends can see them. Untick it to forget it.</p>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-md bg-[var(--profile-accent-fill,#7c3aed)] px-4 py-1.5 text-sm font-medium text-[var(--profile-on-accent,#ffffff)] disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="text-sm text-white/70 hover:underline disabled:opacity-50">
          Cancel
        </button>
      </div>
    </form>
  );
}
