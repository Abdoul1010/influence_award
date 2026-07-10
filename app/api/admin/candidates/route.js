import { supabaseAdmin } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(request) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("candidates")
    .select("*")
    .order("sort_order");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ candidates: data });
}

export async function POST(request) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const body = await request.json();
  const { category_id, name, bio, photo_url, sort_order } = body;

  if (!category_id || !name || !name.trim()) {
    return Response.json(
      { error: "category_id et name sont requis." },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const { error, data } = await db
    .from("candidates")
    .insert({
      category_id,
      name: name.trim(),
      bio: bio?.trim() || null,
      photo_url: photo_url || null,
      sort_order: sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, candidate: data });
}
