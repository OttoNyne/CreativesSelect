import type { Key, Message } from "../index";
import { common } from "./es/common";
import { nav } from "./es/nav";
import { auth } from "./es/auth";
import { time } from "./es/time";
import { feed } from "./es/feed";
import { social } from "./es/social";
import { profile } from "./es/profile";
import { style } from "./es/style";
import { sections } from "./es/sections";
import { settings } from "./es/settings";
import { media } from "./es/media";
import { groups } from "./es/groups";
import { events } from "./es/events";
import { live } from "./es/live";
import { misc } from "./es/misc";
import { labels } from "./es/labels";
import { info } from "./es/info";
import { libmsg } from "./es/libmsg";
import { about } from "./es/about";
import { lib } from "./es/lib";
import { livelog } from "./es/livelog";

// Spanish. Each part of the site has its own file in es/; the server's own (English) messages, shown on the page, are in server.es.ts.
export const messages: Partial<Record<Key, Message>> = { ...common, ...nav, ...auth, ...time, ...feed, ...social, ...profile, ...style, ...sections, ...settings, ...media, ...groups, ...events, ...live, ...misc, ...labels, ...info, ...libmsg, ...about, ...lib, ...livelog };
export { serverEs as server } from "./server.es";
