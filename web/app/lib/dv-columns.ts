/**
 * Builds Dataverse column names from the configured prefix.
 * The prefix is set via DATAVERSE_COLUMN_PREFIX in .env
 * (e.g. "cr6c3" → cr6c3_agentname, cr6c3_username, etc.)
 */
export function getDvColumns(prefix: string) {
  return {
    id:             `${prefix}_table11id`,
    agentname:      `${prefix}_agentname`,
    username:       `${prefix}_username`,
    disableflag:    `${prefix}_disableflagcopilot`,
    reason:         `${prefix}_copilotflagchangereason`,
    lastmodifiedby: `${prefix}_userlastmodifiedby`,
    lastseeninsync: `${prefix}_lastseeninsync`,
    userdeleteflag: `${prefix}_userdeleteflagadgroups`,
  };
}

export type DvColumns = ReturnType<typeof getDvColumns>;

/**
 * Extracts the entity set name from the full DATAVERSE_TABLE_URL.
 * e.g. "https://org.crm.dynamics.com/api/data/v9.2/cr6c3_table11s" → "cr6c3_table11s"
 */
export function getDvEntitySet(tableUrl: string): string {
  return tableUrl.split("/").pop() || "";
}
