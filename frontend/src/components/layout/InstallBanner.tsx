import { useState } from "react";
import { isIOS, isStandalone, rememberDismissed, wasDismissedRecently } from "../../lib/install";

// The Share icon iPhones use: a box with an arrow pointing up out of it.
function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mx-0.5 inline h-4 w-4 -translate-y-px align-middle" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

// Shown only to iPhone and iPad visitors who haven't added the site to their Home Screen and haven't dismissed it lately.
export function InstallBanner() {
  const [visible, setVisible] = useState(() => isIOS() && !isStandalone() && !wasDismissedRecently());
  if (!visible) return null;

  return (
    <div role="region" aria-label="Install the app" className="border-b border-violet-500/30 bg-violet-500/10 px-4 py-2.5">
      <div className="mx-auto flex max-w-5xl items-start gap-3 text-sm text-white/90">
        <p className="flex-1">
          <strong className="font-semibold text-white">Install CreativesSelect:</strong> tap <ShareIcon />
          <span className="font-medium"> Share</span>, then <span className="font-medium">Add to Home Screen</span>. It opens full-screen like an app.
        </p>
        <button
          type="button"
          onClick={() => {
            rememberDismissed();
            setVisible(false);
          }}
          aria-label="Dismiss"
          className="-my-1 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
