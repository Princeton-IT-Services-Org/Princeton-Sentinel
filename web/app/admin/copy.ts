export function getAdminSubtitle(testModeEnabled: boolean): string {
  if (testModeEnabled) {
    return "Operations and controls for ingestion, schedules, and worker health. Test mode is active and Graph data is scoped to the configured test group.";
  }
  return "Operations and controls for ingestion, schedules, and worker health.";
}
