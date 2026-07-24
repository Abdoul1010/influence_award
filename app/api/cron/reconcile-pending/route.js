import { supabaseAdmin } from "@/lib/supabaseClient";
import { checkTransactionStatus } from "@/lib/payment";

// Ne vérifie pas indéfiniment les très vieilles transactions bloquées
// (ex: numéro jamais confirmé) — au-delà, on les marque "failed" pour
// arrêter de gaspiller des appels KomiPay dessus.
const MAX_PENDING_AGE_MINUTES = 45;

export async function GET(request) {
  // Protection : seul un appel connaissant le secret peut déclencher ceci
  // (sinon n'importe qui pourrait spammer cette route publiquement).
  const authHeader = request.headers.get("authorization");
  const url = new URL(request.url);
  const secretParam = url.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  const authorized =
    (expected && authHeader === `Bearer ${expected}`) || // Vercel Cron envoie ce header
    (expected && secretParam === expected); // fallback pour un cron externe

  if (!authorized) {
    return Response.json({ error: "Non autorisé." }, { status: 401 });
  }

  const db = supabaseAdmin();

  const { data: pendingTx, error } = await db
    .from("vote_transactions")
    .select("id, transaction_ref, provider_reference, created_at")
    .eq("status", "pending")
    .not("provider_reference", "is", null);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let confirmed = 0;
  let failed = 0;
  let stillPending = 0;
  let expired = 0;

  for (const tx of pendingTx || []) {
    const ageMinutes = (Date.now() - new Date(tx.created_at).getTime()) / 60000;

    if (ageMinutes > MAX_PENDING_AGE_MINUTES) {
      await db
        .from("vote_transactions")
        .update({ status: "failed" })
        .eq("id", tx.id);
      expired++;
      continue;
    }

    try {
      const result = await checkTransactionStatus(tx.provider_reference, { timeoutMs: 8000 });

      if (!result.resolved) {
        stillPending++;
        continue;
      }

      const newStatus = result.success ? "confirmed" : "failed";
      await db
        .from("vote_transactions")
        .update({
          status: newStatus,
          provider_payload: result.raw,
          confirmed_at: result.success ? new Date().toISOString() : null,
        })
        .eq("id", tx.id);

      if (result.success) confirmed++;
      else failed++;
    } catch (err) {
      console.error(`Erreur réconciliation ${tx.transaction_ref}:`, err.message);
      stillPending++;
    }
  }

  return Response.json({
    checked: pendingTx?.length || 0,
    confirmed,
    failed,
    stillPending,
    expired,
  });
}
