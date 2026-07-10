import { supabaseAdmin } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminAuth";

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // enlève les accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function GET(request) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("categories")
    .select("*")
    .order("sort_order");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ categories: data });
}

export async function POST(request) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const body = await request.json();
  const { label, tag, sort_order } = body;

  if (!label || !label.trim()) {
    return Response.json({ error: "Le nom de la catégorie est requis." }, { status: 400 });
  }

  const db = supabaseAdmin();

  let id = slugify(label);
  // Évite les doublons d'id si deux catégories ont un nom proche.
  const { data: existing } = await db.from("categories").select("id").eq("id", id).maybeSingle();
  if (existing) id = `${id}-${Date.now().toString(36)}`;

  const { error } = await db.from("categories").insert({
    id,
    label: label.trim(),
    tag: tag?.trim() || null,
    sort_order: sort_order ?? 0,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, id });
}
