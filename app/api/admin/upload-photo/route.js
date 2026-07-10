import { supabaseAdmin } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminAuth";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo

export async function POST(request) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return Response.json({ error: "Image trop lourde (max 5 Mo)." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Le fichier doit être une image." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `candidates/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from("candidate-photos")
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: publicUrlData } = db.storage.from("candidate-photos").getPublicUrl(path);
  return Response.json({ url: publicUrlData.publicUrl });
}
