import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatNumber, safeDecode } from "@/app/lib/format";
import { getPagination, getParam, getSortDirection, SearchParams } from "@/app/lib/params";

export default async function GroupDetailPage({ params, searchParams }: { params: { groupId: string }; searchParams?: SearchParams }) {
  await requireUser();

  const groupId = safeDecode(params.groupId);
  const search = getParam(searchParams, "q");
  const { page, pageSize, offset } = getPagination(searchParams, { page: 1, pageSize: 50 });
  const sort = getParam(searchParams, "sort") || "user";
  const dir = getSortDirection(searchParams, "asc");

  const sortMap: Record<string, string> = {
    user: "u.display_name",
    email: "u.mail",
  };
  const sortColumn = sortMap[sort] || "u.display_name";

  const groupRows = await query<any>(
    `SELECT id, display_name, mail, visibility FROM msgraph_groups WHERE id = $1 AND deleted_at IS NULL`,
    [groupId]
  );
  const group = groupRows[0];

  if (!group) {
    return (
      <div className="card p-6">
        <h2 className="font-display text-2xl">Group not found</h2>
        <p className="mt-2 text-slate">The cached inventory does not include this group.</p>
      </div>
    );
  }

  const memberCounts = await query<any>(
    `SELECT COUNT(*)::int AS members FROM msgraph_group_memberships WHERE group_id = $1 AND deleted_at IS NULL`,
    [groupId]
  );

  const drives = await query<any>(
    `
    SELECT id, name, drive_type, web_url, site_id
    FROM msgraph_drives
    WHERE owner_id = $1 AND deleted_at IS NULL
    ORDER BY name
    `,
    [groupId]
  );

  const memberClause = search
    ? "AND (LOWER(u.display_name) LIKE $2 OR LOWER(u.mail) LIKE $2 OR LOWER(u.user_principal_name) LIKE $2 OR LOWER(m.member_id) LIKE $2)"
    : "";

  const memberRows = await query<any>(
    `
    SELECT m.member_id, m.member_type, u.display_name, u.mail, u.user_principal_name
    FROM msgraph_group_memberships m
    LEFT JOIN msgraph_users u ON u.id = m.member_id
    WHERE m.group_id = $1 AND m.deleted_at IS NULL
    ${memberClause}
    ORDER BY ${sortColumn} ${dir.toUpperCase()} NULLS LAST
    LIMIT $${search ? 3 : 2} OFFSET $${search ? 4 : 3}
    `,
    search ? [groupId, `%${search.toLowerCase()}%`, pageSize, offset] : [groupId, pageSize, offset]
  );

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">{group?.display_name || groupId}</h2>
            <div className="text-sm text-slate">{group?.mail || "--"}</div>
            <div className="text-xs text-slate">Group ID: {groupId}</div>
          </div>
          <Link className="badge bg-white/70 text-slate hover:bg-white" href="/dashboard/groups">
            Back to Groups
          </Link>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <div className="card p-6">
          <div className="text-sm text-slate">Visibility</div>
          <div className="text-2xl font-semibold text-ink">{group?.visibility || "unknown"}</div>
        </div>
        <div className="card p-6">
          <div className="text-sm text-slate">Members</div>
          <div className="text-2xl font-semibold text-ink">{formatNumber(memberCounts[0]?.members || 0)}</div>
        </div>
        <div className="card p-6">
          <div className="text-sm text-slate">Drives</div>
          <div className="text-2xl font-semibold text-ink">{formatNumber(drives.length)}</div>
        </div>
      </section>

      <section className="card p-6">
        <h3 className="font-display text-xl">Group Drives</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Drive</th>
                <th className="py-2">Type</th>
                <th className="py-2">Site</th>
              </tr>
            </thead>
            <tbody>
              {drives.map((drive: any) => (
                <tr key={drive.id} className="border-t border-white/60">
                  <td className="py-3">
                    {drive.web_url ? (
                      <a className="font-semibold text-ink underline decoration-dotted" href={drive.web_url} target="_blank" rel="noreferrer">
                        {drive.name || drive.id}
                      </a>
                    ) : (
                      <span className="font-semibold text-ink">{drive.name || drive.id}</span>
                    )}
                  </td>
                  <td className="py-3 text-slate">{drive.drive_type || "--"}</td>
                  <td className="py-3 text-slate">
                    {drive.site_id ? (
                      <Link className="underline decoration-dotted" href={`/dashboard/sites/${encodeURIComponent(drive.site_id)}`}>
                        {drive.site_id}
                      </Link>
                    ) : (
                      "--"
                    )}
                  </td>
                </tr>
              ))}
              {!drives.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={3}>No group drives recorded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl">Members</h3>
          <form className="flex flex-wrap gap-2" method="get">
            <input
              name="q"
              defaultValue={search || ""}
              placeholder="Search members"
              className="rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <button className="badge bg-white/70 text-slate hover:bg-white" type="submit">Search</button>
          </form>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Member</th>
                <th className="py-2">Email/UPN</th>
                <th className="py-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {memberRows.map((row: any) => (
                <tr key={`${row.member_id}-${row.member_type}`} className="border-t border-white/60">
                  <td className="py-3">
                    <div className="font-semibold text-ink">{row.display_name || row.member_id}</div>
                    <div className="text-xs text-slate">{row.member_id}</div>
                  </td>
                  <td className="py-3 text-slate">{row.mail || row.user_principal_name || "--"}</td>
                  <td className="py-3 text-slate">{row.member_type}</td>
                </tr>
              ))}
              {!memberRows.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={3}>No members match that filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
