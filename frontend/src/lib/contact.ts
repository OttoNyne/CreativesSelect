/**
 * Where people can write to the site's people about the policies (shown on the Privacy Policy, Terms and Community guidelines). Set when the
 * site is built, as VITE_CONTACT_EMAIL; when it isn't set (or isn't an address) the pages point to the Report button instead, so no page ever
 * shows a made-up address.
 */
const raw = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() ?? "";

export const CONTACT_EMAIL: string | null = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(raw) ? raw : null;
