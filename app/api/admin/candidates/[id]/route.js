import { supabaseAdmin } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminAuth";

export async function PATCH(request, { params }) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const body = await request.json();
  const { category_id, name, bio, photo_url, sort_order } = body;
  const db = supabaseAdmin();

  const updates = {};
  if (category_id !== undefined) updates.category_id = category_id;
  if (name !== undefined) updates.name = name.trim();
  if (bio !== undefined) updates.bio = bio?.trim() || null;
  if (photo_url !== undefined) updates.photo_url = photo_url;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const { error } = await db.from("candidates").update(updates).eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const db = supabaseAdmin();
  // Empêche la suppression s'il existe déjà des votes payés pour ce candidat,
  // pour ne jamais perdre une trace de paiement réel.
  const { count, error: countError } = await db
    .from("vote_transactions")
    .select("id", { count: "exact", head: true })
    .eq("candidate_id", params.id)
    .eq("status", "confirmed");

  if (countError) return Response.json({ error: countError.message }, { status: 500 });
  if (count > 0) {
    return Response.json(
      {
        error: `Impossible de supprimer : ce candidat a déjà ${count} vote(s) payé(s). Retire-le plutôt du site en le laissant dans une catégorie archivée, ou contacte-moi pour un export avant suppression.`,
      },
      { status: 409 }
    );
  }

  const { error } = await db.from("candidates").delete().eq("id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
