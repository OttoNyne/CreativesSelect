import { useRef, useState } from "react";
import { ShareDialog } from "./ShareDialog";

/** A button that opens the share window (QR code + link) for `url`; focus goes back to it when the window closes. */
export function ShareButton({
  url,
  title,
  description,
  className = "",
  children = "Share",
  onOpen,
}: {
  /** The address to share; a function so it is worked out when the window opens (it depends on where the site is being viewed). */
  url: string | (() => string);
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
  onOpen?: () => void;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={className}
        onClick={() => {
          onOpen?.();
          setShown(typeof url === "function" ? url() : url);
        }}
      >
        {children}
      </button>
      {shown && (
        <ShareDialog
          url={shown}
          title={title}
          description={description}
          onClose={() => {
            setShown(null);
            button.current?.focus();
          }}
        />
      )}
    </>
  );
}
