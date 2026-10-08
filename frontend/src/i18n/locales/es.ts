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

// Spanish. Each part of the site has its own file in es/; the server's own (English) messages, shown on the page, are in server.es.ts.
export const messages: Partial<Record<Key, Message>> = { ...common, ...nav, ...auth, ...time, ...feed, ...social, ...profile, ...style, ...sections };
export { serverEs as server } from "./server.es";
