import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { graphGet } from "@/app/lib/graph";
import { formatBytes, formatDate, formatNumber, safeDecode } from "@/app/lib/format";
import { getInternalDomainPatterns } from "@/app/lib/internalDomains";

type Principal = {
  key: string;
  displayName?: string | null;
  email?: string | null;
  type?: string | null;
  grants: number;
  viaLinks: number;
  classification: string;
};

function splitItemKey(raw: string) {
  const decoded = safeDecode(raw);
  const parts = decoded.split("::");
  if (parts.length < 2) return null;
  return { driveId: parts[0], itemId: parts.slice(1).join("::") };
}

function classifyEmail(email: string | null, patterns: string[]) {
  if (!email) return "unknown";
  const lower = email.toLowerCase();
  if (lower.includes("#ext#")) return "guest";
  if (!patterns.length) return "internal";
  const domain = lower.split("@")[1] || "";
  if (!domain) return "unknown";
  const isInternal = patterns.some((pattern) => {
    if (pattern.startsWith("%")) {
      return domain.endsWith(pattern.replace("%.", ""));
    }
    return domain === pattern;
  });
  return isInternal ? "internal" : "external";
}

function extractPrincipals(permission: any): Array<{ id?: string; displayName?: string; email?: string; type?: string }> {
  const identities: any[] = [];
  const pushIdentity = (obj: any) => {
    if (!obj) return;
    if (Array.isArray(obj)) {
      obj.forEach((entry) => identities.push(entry));
    } else {
      identities.push(obj);
    }
  };

  pushIdentity(permission.grantedToV2);
  pushIdentity(permission.grantedToIdentitiesV2);
  pushIdentity(permission.grantedTo);
  pushIdentity(permission.grantedToIdentities);

  return identities.map((identity) => {
    const user = identity?.user || identity?.siteUser;
    const group = identity?.group;
    const app = identity?.application;
    const principal = user || group || app || {};
    const type = user ? "user" : group ? "group" : app ? "app" : "unknown";
    return {
      id: principal.id,
      displayName: principal.displayName || principal.name,
      email: principal.email || principal.userPrincipalName,
      type,
    };
  });
}

export default async function ItemDetailPage({ params }: { params: { itemId: string } }) {
  await requireUser();

  const key = splitItemKey(params.itemId);
  if (!key) {
    return (
      <div className="card p-6">
        <h2 className="font-display text-2xl">Invalid item id</h2>
        <p className="mt-2 text-slate">Expected format: driveId::itemId</p>
      </div>
    );
  }

  const { driveId, itemId } = key;

  const itemRows = await query<any>(
    `
    SELECT i.*, d.name AS drive_name, d.drive_type, d.web_url AS drive_web_url, d.quota_used, d.quota_total, d.site_id
    FROM msgraph_drive_items i
    JOIN msgraph_drives d ON d.id = i.drive_id
    WHERE i.drive_id = $1 AND i.id = $2
    `,
    [driveId, itemId]
  );

  if (!itemRows.length) {
    return (
      <div className="card p-6">
        <h2 className="font-display text-2xl">Item not found</h2>
        <p className="mt-2 text-slate">The cached inventory does not include this item.</p>
      </div>
    );
  }

  const item = itemRows[0];

  let liveItem: any = null;
  let livePerms: any[] = [];
  let liveError: string | null = null;
  try {
    liveItem = await graphGet(`/drives/${driveId}/items/${itemId}?select=id,name,webUrl,createdDateTime,lastModifiedDateTime,createdBy,lastModifiedBy,file,folder,shared,parentReference`);
    const perms = await graphGet(`/drives/${driveId}/items/${itemId}/permissions`);
    livePerms = Array.isArray(perms?.value) ? perms.value : [];
  } catch (err: any) {
    liveError = err?.message || "Failed to load live Graph data";
  }

  const patterns = getInternalDomainPatterns();
  const linkPerms = livePerms.filter((perm) => perm.link);
  const linkBreakdown = new Map<string, number>();
  for (const perm of linkPerms) {
    const key = `${perm.link?.scope || "direct"}::${perm.link?.type || "unknown"}`;
    linkBreakdown.set(key, (linkBreakdown.get(key) || 0) + 1);
  }

  const principalMap = new Map<string, Principal>();
  for (const perm of livePerms) {
    const principals = extractPrincipals(perm);
    const viaLink = !!perm.link;
    for (const principal of principals) {
      const keyVal = principal.email || principal.id || principal.displayName || "unknown";
      const existing = principalMap.get(keyVal) || {
        key: keyVal,
        displayName: principal.displayName,
        email: principal.email,
        type: principal.type,
        grants: 0,
        viaLinks: 0,
        classification: classifyEmail(principal.email || null, patterns),
      };
      existing.grants += 1;
      if (viaLink) existing.viaLinks += 1;
      principalMap.set(keyVal, existing);
    }
  }

  const principalList = Array.from(principalMap.values()).sort((a, b) => b.grants - a.grants);
  const guestCount = principalList.filter((p) => p.classification === "guest").length;
  const externalCount = principalList.filter((p) => p.classification === "external").length;
  const principals = principalList.slice(0, 25);

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">{item.name || item.id}</h2>
            <div className="mt-1 text-xs uppercase tracking-[0.3em] text-slate/60">Live (Graph) + Cached (DB)</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="badge bg-white/70 text-slate">{item.is_folder ? "Folder" : "File"}</span>
              {linkPerms.length > 0 && <span className="badge badge-warn">Shared</span>}
              {linkPerms.some((perm) => perm.link?.scope === "anonymous") && <span className="badge badge-error">Anonymous link</span>}
              {linkPerms.some((perm) => perm.link?.scope === "organization") && <span className="badge badge-warn">Org-wide link</span>}
            </div>
            <div className="mt-2 text-xs text-slate">Item ID: {item.id}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="badge bg-white/70 text-slate hover:bg-white" href="/dashboard/risk">
              Back to Risk
            </Link>
            {item.web_url && (
              <a className="badge bg-amber-100 text-amber-900" href={item.web_url} target="_blank" rel="noreferrer">
                Open Item
              </a>
            )}
            {item.drive_web_url && (
              <a className="badge bg-emerald-100 text-emerald-900" href={item.drive_web_url} target="_blank" rel="noreferrer">
                Open Drive
              </a>
            )}
          </div>
        </div>
      </section>

      {liveError && (
        <section className="card p-6">
          <div className="badge badge-error">{liveError}</div>
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-3">
        <div className="card p-6">
          <h3 className="font-display text-xl">Item Metadata</h3>
          <div className="mt-3 text-sm text-slate">Size</div>
          <div className="text-2xl font-semibold text-ink">{formatBytes(item.size)}</div>
          <div className="mt-2 text-xs text-slate">Created: {formatDate(liveItem?.createdDateTime || item.created_dt)}</div>
          <div className="text-xs text-slate">Last modified: {formatDate(liveItem?.lastModifiedDateTime || item.modified_dt)}</div>
        </div>
        <div className="card p-6">
          <h3 className="font-display text-xl">Drive Context</h3>
          <div className="mt-3 text-sm text-slate">Drive</div>
          <div className="text-lg font-semibold text-ink">{item.drive_name || item.drive_id}</div>
          <div className="text-xs text-slate">Type: {item.drive_type || "--"}</div>
          <div className="mt-2 text-xs text-slate">Quota: {formatBytes(item.quota_used)} / {formatBytes(item.quota_total)}</div>
        </div>
        <div className="card p-6">
          <h3 className="font-display text-xl">Sharing Exposure</h3>
          <div className="mt-3 text-sm text-slate">Link shares</div>
          <div className="text-2xl font-semibold text-ink">{formatNumber(linkPerms.length)}</div>
          <div className="mt-2 text-sm text-slate">Principals</div>
          <div className="text-xl font-semibold text-ink">{formatNumber(principals.length)}</div>
          <div className="mt-2 text-xs text-slate">Guests: {formatNumber(guestCount)} • External: {formatNumber(externalCount)}</div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-display text-xl">Access Links</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Scope</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Roles</th>
                  <th className="py-2">Link</th>
                </tr>
              </thead>
              <tbody>
                {linkPerms.slice(0, 25).map((perm: any) => (
                  <tr key={perm.id} className="border-t border-white/60">
                    <td className="py-3 text-ink">{perm.link?.scope || "--"}</td>
                    <td className="py-3 text-slate">{perm.link?.type || "--"}</td>
                    <td className="py-3 text-slate">{Array.isArray(perm.roles) ? perm.roles.join(", ") : "--"}</td>
                    <td className="py-3 text-slate">{perm.link?.webUrl ? "available" : "--"}</td>
                  </tr>
                ))}
                {!linkPerms.length && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={4}>No link permissions.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl">Sharing Breakdown</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Scope</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(linkBreakdown.entries()).map(([keyVal, count]) => {
                  const [scope, type] = keyVal.split("::");
                  return (
                    <tr key={keyVal} className="border-t border-white/60">
                      <td className="py-3 text-ink">{scope}</td>
                      <td className="py-3 text-slate">{type}</td>
                      <td className="py-3 text-slate">{formatNumber(count)}</td>
                    </tr>
                  );
                })}
                {!linkBreakdown.size && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={3}>No link breakdown.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-display text-xl">Principals</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Principal</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Classification</th>
                  <th className="py-2">Grants</th>
                </tr>
              </thead>
              <tbody>
                {principals.map((principal) => (
                  <tr key={principal.key} className="border-t border-white/60">
                    <td className="py-3">
                      <div className="font-semibold text-ink">{principal.displayName || principal.email || principal.key}</div>
                      <div className="text-xs text-slate">{principal.email || "--"}</div>
                    </td>
                    <td className="py-3 text-slate">{principal.type || "--"}</td>
                    <td className="py-3 text-slate">{principal.classification}</td>
                    <td className="py-3 text-slate">{formatNumber(principal.grants)}</td>
                  </tr>
                ))}
                {!principals.length && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={4}>No principals available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl">Permissions</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Permission</th>
                  <th className="py-2">Roles</th>
                  <th className="py-2">Link</th>
                  <th className="py-2">Principals</th>
                </tr>
              </thead>
              <tbody>
                {livePerms.slice(0, 25).map((perm: any) => (
                  <tr key={perm.id} className="border-t border-white/60">
                    <td className="py-3 text-ink">{perm.id}</td>
                    <td className="py-3 text-slate">{Array.isArray(perm.roles) ? perm.roles.join(", ") : "--"}</td>
                    <td className="py-3 text-slate">{perm.link?.scope || "direct"}</td>
                    <td className="py-3 text-slate">{formatNumber(extractPrincipals(perm).length)}</td>
                  </tr>
                ))}
                {!livePerms.length && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={4}>No permissions returned.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
