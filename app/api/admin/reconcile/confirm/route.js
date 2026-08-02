import { supabaseAdmin } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminAuth";
import { checkTransactionStatus } from "@/lib/payment";

export async function POST(request) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const { id } = await request.json();
  if (!id) return Response.json({ error: "id requis." }, { status: 400 });

  const db = supabaseAdmin();

  const { data: tx, error: txError } = await db
    .from("vote_transactions")
    .select("id, provider_reference, status")
    .eq("id", id)
    .single();

  if (txError || !tx) {
    return Response.json({ error: "Transaction introuvable." }, { status: 404 });
  }
  if (!tx.provider_reference) {
    return Response.json({ error: "Aucune référence KomiPay pour cette transaction." }, { status: 400 });
  }

  // Revérification finale avant de toucher à la base — on ne fait jamais
  // confiance à un statut affiché il y a potentiellement plusieurs minutes.
  const result = await checkTransactionStatus(tx.provider_reference, { timeoutMs: 8000 });

  if (!result.resolved || !result.success) {
    return Response.json(
      { error: "KomiPay ne confirme plus ce paiement comme réussi. Rafraîchis la liste." },
      { status: 409 }
    );
  }

  const { error: updateError } = await db
    .from("vote_transactions")
    .update({
      status: "confirmed",
      provider_payload: result.raw,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ ok: true });
}
