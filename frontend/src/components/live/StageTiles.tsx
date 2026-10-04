import { Avatar } from "../common/Avatar";
import type { User } from "../../types";

function Tile({
  user,
  name,
  speaking = false,
  state,
  onRemove,
  removeLabel,
}: {
  user: User;
  name: string;
  speaking?: boolean;
  /** A short line under the name: "Muted", "Invited"… */
  state?: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <li
      aria-label={`${name}${speaking ? ", speaking" : ""}${state ? `, ${state.toLowerCase()}` : ""}`}
      className={`relative flex h-28 flex-col items-center justify-center gap-1 rounded-xl border bg-white/[0.03] p-2 text-center ${
        speaking ? "border-2 border-emerald-400" : state === "Invited" ? "border-dashed border-white/30" : "border-white/10"
      }`}
    >
      <Avatar username={user.username} displayName={user.displayName} avatarUrl={user.avatarUrl} size={44} />
      <span className="max-w-full truncate text-xs font-medium text-white">{name}</span>
      {state && <span className="text-[11px] text-white/70">{state}</span>}
      {speaking && !state && <span className="text-[11px] text-emerald-300">Speaking</span>}
      {onRemove && (
        <button onClick={onRemove} aria-label={removeLabel} className="absolute right-1 top-1 rounded px-1.5 py-0.5 text-[11px] text-white/70 hover:bg-white/10 hover:text-white">
          Remove
        </button>
      )}
    </li>
  );
}

/**
 * The stage as a grid of tiles for a wide screen: the host first, then each guest speaking, each invitation waiting for an
 * answer, and an open place for every one still free. A green ring shows who is speaking right now.
 */
export function StageTiles({
  host,
  hostMuted,
  guests,
  invited,
  maxGuests,
  speaking,
  onRemove,
  onFindListeners,
}: {
  host: User;
  hostMuted: boolean;
  guests: { user: User }[];
  invited: { user: User }[];
  maxGuests: number;
  /** User ids the media server hears speaking right now. */
  speaking: string[];
  onRemove: (user: User) => void;
  /** An empty place was chosen: take the host to the list of listeners to invite from. */
  onFindListeners: () => void;
}) {
  const free = Math.max(0, maxGuests - guests.length - invited.length);
  const isSpeaking = (id: string) => speaking.includes(id);
  return (
    <ul aria-label="The stage" className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      <Tile user={host} name="You" speaking={!hostMuted && isSpeaking(host.id)} state={hostMuted ? "Muted" : undefined} />
      {guests.map(({ user }) => (
        <Tile key={user.id} user={user} name={user.displayName} speaking={isSpeaking(user.id)} onRemove={() => onRemove(user)} removeLabel={`Remove ${user.displayName} from the stage`} />
      ))}
      {invited.map(({ user }) => (
        <Tile key={user.id} user={user} name={user.displayName} state="Invited" />
      ))}
      {Array.from({ length: free }, (_, i) => (
        <li key={`free-${i}`} className="h-28">
          <button
            onClick={onFindListeners}
            aria-label="Invite someone to speak"
            className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/20 text-xs text-white/70 hover:bg-white/5 hover:text-white"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              +
            </span>
            Invite
          </button>
        </li>
      ))}
    </ul>
  );
}
