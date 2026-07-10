import { supabaseAdmin } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(request) {
  const email = await requireAdmin(request);
  if (!email) {
    return Response.json({ error: "Accès refusé." }, { status: 403 });
  }

  const db = supabaseAdmin();

  const { data: counts, error: countsError } = await db
    .from("candidate_vote_counts")
    .select("*");

  const { data: recentVotes, error: recentError } = await db
    .from("vote_transactions")
    .select("id, category_id, candidate_id, phone_number, status, amount, created_at, confirmed_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (countsError || recentError) {
    return Response.json({ error: "Erreur de lecture." }, { status: 500 });
  }

  const totalRevenue = counts.reduce((sum, c) => sum + (c.revenue_fcfa || 0), 0);
  const totalVotes = counts.reduce((sum, c) => sum + (c.votes || 0), 0);

  return Response.json({ counts, recentVotes, totalRevenue, totalVotes });
}
