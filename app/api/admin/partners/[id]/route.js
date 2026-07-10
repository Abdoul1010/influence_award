import { supabaseAdmin } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminAuth";

export async function PATCH(request, { params }) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const body = await request.json();
  const { name, logo_url, sort_order } = body;
  const db = supabaseAdmin();

  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (logo_url !== undefined) updates.logo_url = logo_url;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const { error } = await db.from("partners").update(updates).eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const db = supabaseAdmin();
  const { error } = await db.from("partners").delete().eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
