import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type TextareaHTMLAttributes } from "react";
import { mentionsApi, type MentionPerson } from "../../api/mentions.api";
import { activeMention, insertMention } from "../../lib/mentions";
import { Avatar } from "./Avatar";
import { t } from "../../i18n";

type Field = HTMLInputElement | HTMLTextAreaElement;
type Extra = {
  /** Class for the box around the field and the list (it must be positioned); defaults to a plain block. */
  wrapperClassName?: string;
  /** Open the list above the field instead of below it (for a field at the bottom of the screen). */
  listAbove?: boolean;
};

const WAIT_MS = 150;

/**
 * A text field where typing @ offers people to name: the list follows what is typed after the @, the arrow keys and Enter (or a tap) pick
 * one, and Escape closes it. The chosen @username goes into the text as plain text. Otherwise it is the ordinary field, with every
 * property passed through, so it can stand in for a textarea or an input anywhere people write.
 */
function useMentions(ref: React.RefObject<Field | null>, props: { onChange?: (e: never) => void; onKeyDown?: (e: never) => void; onBlur?: (e: never) => void }) {
  const [people, setPeople] = useState<MentionPerson[]>([]);
  const [active, setActive] = useState(0);
  const [typing, setTyping] = useState<{ start: number; query: string } | null>(null);
  const asked = useRef(0);
  const listId = useId();
  const open = typing !== null && people.length > 0;

  // ask for people a moment after the typing settles, and ignore an answer to a question that has since changed
  useEffect(() => {
    if (!typing) {
      setPeople([]);
      return;
    }
    const mine = ++asked.current;
    const timer = setTimeout(() => {
      mentionsApi
        .suggest(typing.query)
        .then(({ people }) => {
          if (asked.current !== mine) return;
          setPeople(people);
          setActive(0);
        })
        .catch(() => asked.current === mine && setPeople([]));
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [typing]);

  const look = useCallback((el: Field) => {
    const found = activeMention(el.value, el.selectionStart ?? el.value.length);
    setTyping((old) => (found && old && old.start === found.start && old.query === found.query ? old : found));
  }, []);

  function choose(person: MentionPerson) {
    const el = ref.current;
    if (!el || !typing) return;
    const next = insertMention(el.value, el.selectionStart ?? el.value.length, typing.start, person.username);
    // set the value the way typing would, so whoever owns the field hears about it through its own onChange
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
    setter?.call(el, next.text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.setSelectionRange(next.caret, next.caret);
    el.focus();
    setTyping(null);
  }

  const onKeyDown = (e: KeyboardEvent<Field>) => {
    if (open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i + (e.key === "ArrowDown" ? 1 : people.length - 1)) % people.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(people[active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setTyping(null);
        return;
      }
    }
    props.onKeyDown?.(e as never);
  };

  const handlers = {
    onChange: (e: React.ChangeEvent<Field>) => {
      props.onChange?.(e as never);
      look(e.currentTarget);
    },
    onKeyUp: (e: KeyboardEvent<Field>) => {
      if (["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(e.key)) return;
      look(e.currentTarget);
    },
    onClick: (e: React.MouseEvent<Field>) => look(e.currentTarget),
    onBlur: (e: React.FocusEvent<Field>) => {
      setTyping(null);
      props.onBlur?.(e as never);
    },
    onKeyDown,
  };
  const aria = {
    "aria-autocomplete": "list" as const,
    "aria-controls": open ? listId : undefined,
    "aria-activedescendant": open ? `${listId}-${active}` : undefined,
  };
  return { handlers, aria, open, people, active, choose, listId };
}

function Suggestions({ id, people, active, onChoose, above }: { id: string; people: MentionPerson[]; active: number; onChoose: (p: MentionPerson) => void; above?: boolean }) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={t("mention.listLabel")}
      className={`absolute start-0 z-30 max-h-56 w-64 max-w-full overflow-y-auto rounded-lg border border-white/15 bg-neutral-900 p-1 shadow-xl ${above ? "bottom-full mb-1" : "top-full mt-1"}`}
    >
      {people.map((p, i) => (
        <li
          key={p.id}
          id={`${id}-${i}`}
          role="option"
          aria-selected={i === active}
          // choosing must not take the focus away from the field, or the list would close before the tap lands
          onMouseDown={(e) => {
            e.preventDefault();
            onChoose(p);
          }}
          className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white ${i === active ? "bg-violet-600/40" : "hover:bg-white/10"}`}
        >
          <Avatar username={p.username} displayName={p.displayName} avatarUrl={p.avatarUrl} size={22} />
          <span className="min-w-0 flex-1 truncate">
            <bdi>{p.displayName}</bdi> <bdi dir="ltr" className="text-white/70">@{p.username}</bdi>
          </span>
          {p.isFriend && <span className="shrink-0 text-[10px] text-white/70">{t("mention.friend")}</span>}
        </li>
      ))}
    </ul>
  );
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Extra>(function MentionTextarea({ wrapperClassName = "relative", listAbove, ...props }, outer) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(outer, () => ref.current as HTMLTextAreaElement);
  const m = useMentions(ref, props as never);
  return (
    <div className={wrapperClassName}>
      <textarea {...props} ref={ref} {...m.handlers} {...m.aria} />
      {m.open && <Suggestions id={m.listId} people={m.people} active={m.active} onChoose={m.choose} above={listAbove} />}
    </div>
  );
});

export const MentionInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Extra>(function MentionInput({ wrapperClassName = "relative", listAbove, ...props }, outer) {
  const ref = useRef<HTMLInputElement>(null);
  useImperativeHandle(outer, () => ref.current as HTMLInputElement);
  const m = useMentions(ref, props as never);
  return (
    <div className={wrapperClassName}>
      <input {...props} ref={ref} {...m.handlers} {...m.aria} />
      {m.open && <Suggestions id={m.listId} people={m.people} active={m.active} onChoose={m.choose} above={listAbove} />}
    </div>
  );
});
