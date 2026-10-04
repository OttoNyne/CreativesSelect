import { api } from "./client";
import type { OnboardingState } from "../types";

export const onboardingApi = {
  /** The getting-started checklist: which steps are done (worked out from what the person has really done), and whether to show it. */
  get: () => api.get<OnboardingState>("/onboarding"),
  /** Hide the checklist for good. */
  dismiss: () => api.post<void>("/onboarding/dismiss"),
};
