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

// English is the source: every other language is checked against these keys, and anything not translated yet shows as it is here.
// Each part of the site has its own file (en/, es/ and ar/ hold one per part).
export const en = { ...common, ...nav, ...auth, ...time, ...feed, ...social, ...profile, ...style, ...sections, ...settings, ...media } satisfies Catalog;
