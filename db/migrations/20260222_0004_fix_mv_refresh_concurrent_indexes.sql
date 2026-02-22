-- REFRESH MATERIALIZED VIEW CONCURRENTLY requires a UNIQUE index that uses
-- only column names (no expressions, no partial predicate).
DROP INDEX IF EXISTS mv_msgraph_link_breakdown_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS mv_msgraph_link_breakdown_uidx
ON mv_msgraph_link_breakdown (link_scope, link_type);

DROP INDEX IF EXISTS mv_msgraph_drive_type_counts_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS mv_msgraph_drive_type_counts_uidx
ON mv_msgraph_drive_type_counts (drive_type);
