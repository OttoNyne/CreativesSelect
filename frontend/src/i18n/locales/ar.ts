import type { Key, Message } from "../index";
import { common } from "./ar/common";
import { nav } from "./ar/nav";
import { auth } from "./ar/auth";
import { time } from "./ar/time";
import { feed } from "./ar/feed";
import { social } from "./ar/social";
import { profile } from "./ar/profile";
import { style } from "./ar/style";
import { sections } from "./ar/sections";
import { settings } from "./ar/settings";
import { media } from "./ar/media";
import { groups } from "./ar/groups";
import { events } from "./ar/events";
import { live } from "./ar/live";
import { misc } from "./ar/misc";
import { labels } from "./ar/labels";

// Arabic (right to left). Each part of the site has its own file in ar/; the server's own (English) messages, shown on the page, are in server.ar.ts.
export const messages: Partial<Record<Key, Message>> = { ...common, ...nav, ...auth, ...time, ...feed, ...social, ...profile, ...style, ...sections, ...settings, ...media, ...groups, ...events, ...live, ...misc, ...labels };
export { serverAr as server } from "./server.ar";
