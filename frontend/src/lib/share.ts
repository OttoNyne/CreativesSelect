/** The address people should be sent to. */
export const CANONICAL_SITE = "https://www.creativesselect.com";

/**
 * The address to put in a link or QR code. The site is also reachable at its old *.vercel.app address, but that one no
 * longer takes sign-ins, so shared links always use the real domain. On a developer's own machine the page's own address
 * is used so the code still opens the copy being worked on.
 */
export function siteOrigin(location: Pick<Location, "origin" | "hostname"> = window.location): string {
  const { origin, hostname } = location;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost")) return origin;
  if (hostname.endsWith(".vercel.app")) return CANONICAL_SITE;
  return origin;
}

export const siteUrl = () => siteOrigin();
export const profileUrl = (username: string) => `${siteOrigin()}/u/${encodeURIComponent(username)}`;
/** The link a friend opens to join through someone's invite. */
export const inviteUrl = (code: string) => `${siteOrigin()}/join/${encodeURIComponent(code)}`;
export const liveUrl = (liveId: string) => `${siteOrigin()}/live/${encodeURIComponent(liveId)}`;

/** A QR code for `url` as a PNG data address (loaded on demand: it is only needed when someone opens the share window). */
export async function qrCodeFor(url: string): Promise<string> {
  const QRCode = await import("qrcode");
  // Black on white with a clear border all round: the combination every phone camera reads most reliably.
  return QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 512, color: { dark: "#000000", light: "#ffffff" } });
}
