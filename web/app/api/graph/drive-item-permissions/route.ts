import { NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/app/lib/auth";
import { graphDelete, graphGet } from "@/app/lib/graph";
import { withTransaction } from "@/app/lib/db";
import { writeAuditEvent } from "@/app/lib/audit";
export const dynamic = "force-dynamic";

async function parseBody(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }
  if (contentType.includes("form")) {
    const form = await req.formData();
    return Object.fromEntries(form.entries());
  }
  return {};
}

export async function GET(req: Request) {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const driveId = searchParams.get("driveId");
  const itemId = searchParams.get("itemId");
  if (!driveId || !itemId) {
    return NextResponse.json({ error: "driveId_and_itemId_required" }, { status: 400 });
  }

  try {
    const data = await graphGet(`/drives/${driveId}/items/${itemId}/permissions`);
    return NextResponse.json({ mode: "live", data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  let session: any = null;
  try {
    const auth = await requireAdmin();
    session = auth.session;
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body: any = await parseBody(req);
  const { searchParams } = new URL(req.url);
  const driveId = body.driveId || searchParams.get("driveId");
  const itemId = body.itemId || searchParams.get("itemId");
  const permissionId = body.permissionId || searchParams.get("permissionId");
  if (!driveId || !itemId || !permissionId) {
    return NextResponse.json({ error: "driveId_itemId_permissionId_required" }, { status: 400 });
  }

  let permission: any = null;
  try {
    permission = await graphGet(`/drives/${driveId}/items/${itemId}/permissions/${permissionId}`);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const roles: string[] = Array.isArray(permission?.roles) ? permission.roles : [];
  const hasOwnerRole = roles.some((role) => typeof role === "string" && role.toLowerCase().includes("owner"));
  if (hasOwnerRole) {
    return NextResponse.json({ error: "owner_permission_delete_blocked" }, { status: 403 });
  }

  try {
    await graphDelete(`/drives/${driveId}/items/${itemId}/permissions/${permissionId}`);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  await withTransaction(async (client) => {
    await client.query(
      `
      DELETE FROM msgraph_drive_item_permission_grants
      WHERE drive_id = $1 AND item_id = $2 AND permission_id = $3
      `,
      [driveId, itemId, permissionId]
    );
    await client.query(
      `
      DELETE FROM msgraph_drive_item_permissions
      WHERE drive_id = $1 AND item_id = $2 AND permission_id = $3
      `,
      [driveId, itemId, permissionId]
    );
    await client.query(
      `
      UPDATE msgraph_drive_items
      SET permissions_last_synced_at = now(),
          permissions_last_error_at = NULL,
          permissions_last_error = NULL
      WHERE drive_id = $1 AND id = $2
      `,
      [driveId, itemId]
    );
  });

  await writeAuditEvent({
    action: "permission_deleted",
    entityType: "drive_item_permission",
    entityId: `${driveId}:${itemId}:${permissionId}`,
    actor: {
      oid: (session?.user as any)?.oid,
      upn: (session?.user as any)?.upn,
      name: session?.user?.name,
    },
    details: {
      driveId,
      itemId,
      permissionId,
      roles,
      link: permission?.link || null,
    },
  });

  return NextResponse.json({ ok: true });
}
