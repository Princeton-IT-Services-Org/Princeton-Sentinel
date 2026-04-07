import type { FeatureFlags } from "./feature-flags-config";
import { matchesFeaturePath } from "./feature-flags-config";

export const FEATURE_DISABLED_REDIRECT_DELAY_MS = 15_000;
export const FEATURE_DISABLED_REDIRECT_TARGET = "/dashboard";
export const FEATURE_DISABLED_MESSAGE = "This feature was disabled. Redirecting to Overview.";

export function shouldRedirectForDisabledFeature(previousFlags: FeatureFlags, nextFlags: FeatureFlags, pathname: string) {
  return previousFlags.agents_dashboard && !nextFlags.agents_dashboard && matchesFeaturePath("agents_dashboard", pathname);
}
