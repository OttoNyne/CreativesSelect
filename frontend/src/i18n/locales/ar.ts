import type { Key, Message } from "../index";
import { common } from "./ar/common";
import { nav } from "./ar/nav";
import { auth } from "./ar/auth";

// Arabic (right to left). Each part of the site has its own file in ar/; the server's own (English) messages, shown on the page, are in server.ar.ts.
export const messages: Partial<Record<Key, Message>> = { ...common, ...nav, ...auth };
export { serverAr as server } from "./server.ar";
