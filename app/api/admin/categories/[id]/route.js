import { supabaseAdmin } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminAuth";

export async function PATCH(request, { params }) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const body = await request.json();
  const { label, tag, sort_order } = body;
  const db = supabaseAdmin();

  const updates = {};
  if (label !== undefined) updates.label = label.trim();
  if (tag !== undefined) updates.tag = tag?.trim() || null;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const { error } = await db.from("categories").update(updates).eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const db = supabaseAdmin();
  // Les candidats de cette catégorie sont supprimés automatiquement
  // (contrainte "on delete cascade" définie dans le schéma).
  const { error } = await db.from("categories").delete().eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
