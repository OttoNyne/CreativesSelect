// The site's service worker. It does one job: show a notification when the server sends one, even with the site closed, and take the
// person to the right page when they tap it. It caches nothing and never answers a page's requests, so it can't serve an old copy of the
// site after an update.

// Only a path on this site: a notification can never send anyone somewhere else.
function pathOnThisSite(url) {
  return typeof url === "string" && /^\/(?!\/)/.test(url) ? url : "/";
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 80) : "CreativesSelect";
  const tag = typeof data.tag === "string" && data.tag ? data.tag.slice(0, 100) : undefined;
  const options = {
    body: typeof data.body === "string" ? data.body.slice(0, 200) : "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: pathOnThisSite(data.url) },
  };
  if (tag) {
    options.tag = tag; // a newer one with the same tag replaces the one on the screen
    options.renotify = true;
  }
  // a browser insists that every push shows something, so this always does
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = pathOnThisSite(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        if ("navigate" in open) await open.navigate(url).catch(() => {});
        return open.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
