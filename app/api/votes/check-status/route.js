import { supabaseAdmin } from "@/lib/supabaseClient";
import { checkTransactionStatus } from "@/lib/payment";

export async function POST(request) {
  try {
    const { transactionRef } = await request.json();
    if (!transactionRef) {
      return Response.json({ error: "transactionRef requis." }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: tx, error: txError } = await db
      .from("vote_transactions")
      .select("id, status, provider_reference")
      .eq("transaction_ref", transactionRef)
      .single();

    if (txError || !tx) {
      return Response.json({ error: "Transaction introuvable." }, { status: 404 });
    }

    // Déjà résolue lors d'un appel précédent : pas besoin de rappeler KomiPay.
    if (tx.status !== "pending") {
      return Response.json({ status: tx.status });
    }

    if (!tx.provider_reference) {
      return Response.json({ status: "pending" });
    }

    const result = await checkTransactionStatus(tx.provider_reference, { timeoutMs: 8000 });

    if (!result.resolved) {
      // Toujours en attente (ou délai dépassé) : le frontend rappellera plus tard.
      return Response.json({ status: "pending" });
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

    return Response.json({ status: newStatus });
  } catch (err) {
    console.error("Erreur vérification statut:", err);
    return Response.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}
