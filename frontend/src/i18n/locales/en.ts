import type { Catalog } from "../index";
import { common } from "./en/common";
import { nav } from "./en/nav";
import { auth } from "./en/auth";

// English is the source: every other language is checked against these keys, and anything not translated yet shows as it is here.
// Each part of the site has its own file (en/, es/ and ar/ hold one per part).
export const en = { ...common, ...nav, ...auth } satisfies Catalog;
