import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseClient";

/**
 * Vérifie le token Supabase envoyé dans l'en-tête Authorization et confirme
 * que l'email correspondant figure bien dans la table admin_users.
 * Retourne l'email si autorisé, sinon null.
 */
export async function requireAdmin(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    console.log("[requireAdmin] Aucun token reçu.");
    return null;
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.email) {
    console.log("[requireAdmin] Token invalide :", error?.message);
    return null;
  }
  console.log("[requireAdmin] Email authentifié :", data.user.email);

  const db = supabaseAdmin();
  const { data: admin, error: adminError } = await db
    .from("admin_users")
    .select("email")
    .eq("email", data.user.email)
    .maybeSingle();

  if (adminError) {
    console.log("[requireAdmin] Erreur requête admin_users :", adminError);
    return null;
  }
  console.log("[requireAdmin] Résultat recherche admin_users :", admin);

  return admin ? data.user.email : null;
}
