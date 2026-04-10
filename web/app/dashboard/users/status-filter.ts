export type UserStatusFilter = "active" | "inactive" | "all";

const USER_STATUS_OPTIONS: UserStatusFilter[] = ["active", "inactive", "all"];

export function normalizeUserStatus(value: string | null | undefined): UserStatusFilter {
  return USER_STATUS_OPTIONS.includes(value as UserStatusFilter) ? (value as UserStatusFilter) : "active";
}

export function buildUserStatusPredicate(status: UserStatusFilter, alias = "u") {
  const columnPrefix = alias ? `${alias}.` : "";
  switch (status) {
    case "inactive":
      return `AND ${columnPrefix}deleted_at IS NULL AND ${columnPrefix}account_enabled IS NOT TRUE`;
    case "all":
      return `AND ${columnPrefix}deleted_at IS NULL`;
    case "active":
    default:
      return `AND ${columnPrefix}deleted_at IS NULL AND ${columnPrefix}account_enabled IS TRUE`;
  }
}

export function getUserStatusLabel(status: UserStatusFilter) {
  switch (status) {
    case "inactive":
      return "Inactive";
    case "all":
      return "All";
    case "active":
    default:
      return "Active";
  }
}

export function getUserStatusSubtitle(status: UserStatusFilter) {
  switch (status) {
    case "inactive":
      return "Directory-backed inactive users with disabled accounts.";
    case "all":
      return "Directory-backed users across active and inactive accounts.";
    case "active":
    default:
      return "Directory-backed active users matching the overview dashboard metric.";
  }
}
