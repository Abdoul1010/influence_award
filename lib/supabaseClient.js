import { createClient } from "@supabase/supabase-js";

// Client "public" — utilisé dans les pages React (navigateur).
// Utilise la clé anonyme : ne peut que LIRE (RLS l'interdit en écriture).
export const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Client "serveur" — utilisé UNIQUEMENT dans les routes API (jamais côté navigateur).
// Utilise la clé service_role : contourne RLS, donc à garder secrète (.env, jamais commit).
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}
