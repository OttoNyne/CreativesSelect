import type { Catalog } from "../index";
import { common } from "./en/common";
import { nav } from "./en/nav";
import { auth } from "./en/auth";
import { time } from "./en/time";
import { feed } from "./en/feed";
import { social } from "./en/social";
import { profile } from "./en/profile";
import { style } from "./en/style";
import { sections } from "./en/sections";
import { settings } from "./en/settings";
import { media } from "./en/media";
import { groups } from "./en/groups";
import { events } from "./en/events";
import { live } from "./en/live";
import { misc } from "./en/misc";
import { labels } from "./en/labels";
import { info } from "./en/info";
import { libmsg } from "./en/libmsg";
import { about } from "./en/about";
import { lib } from "./en/lib";
import { livelog } from "./en/livelog";
import { credits } from "./en/credits";
import { work } from "./en/work";

// English is the source: every other language is checked against these keys, and anything not translated yet shows as it is here.
// Each part of the site has its own file (en/, es/ and ar/ hold one per part).
export const en = { ...common, ...nav, ...auth, ...time, ...feed, ...social, ...profile, ...style, ...sections, ...settings, ...media, ...groups, ...events, ...live, ...misc, ...labels, ...info, ...libmsg, ...about, ...lib, ...livelog, ...credits, ...work } satisfies Catalog;
