import { supabaseAdmin } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(request) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const db = supabaseAdmin();
  const { data, error } = await db.from("partners").select("*").order("sort_order");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ partners: data });
}

export async function POST(request) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const body = await request.json();
  const { name, logo_url, sort_order } = body;

  if (!name || !name.trim()) {
    return Response.json({ error: "Le nom du partenaire est requis." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error, data } = await db
    .from("partners")
    .insert({
      name: name.trim(),
      logo_url: logo_url || null,
      sort_order: sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, partner: data });
}
