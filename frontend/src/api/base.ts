// Where API requests go.
//
// Production: same origin (""), so calls look like /api/... on the site's own
// domain and Vercel proxies them to the API (see vercel.json). This keeps the
// login cookie first-party, which iOS/Safari requires — it blocks cookies set
// by a different site than the page, even with SameSite=None.
//
// Development: the API runs separately on another port; VITE_API_URL can
// override the default.
export const API_BASE: string = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL ?? "http://localhost:5000")
  : "";
