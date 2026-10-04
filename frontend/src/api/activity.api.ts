import { api } from "./client";

export const activityApi = {
  /** Lets friends see that you're around ("Online now"). The server writes it at most once a minute. */
  ping: () => api.post<void>("/activity/ping"),
};
