import type { Key, Message } from "../index";
import { common } from "./es/common";
import { nav } from "./es/nav";
import { auth } from "./es/auth";

// Spanish. Each part of the site has its own file in es/; the server's own (English) messages, shown on the page, are in server.es.ts.
export const messages: Partial<Record<Key, Message>> = { ...common, ...nav, ...auth };
export { serverEs as server } from "./server.es";
