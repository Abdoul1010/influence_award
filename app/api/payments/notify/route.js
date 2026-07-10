import { supabaseAdmin } from "@/lib/supabaseClient";
import { verifyTransaction } from "@/lib/payment";

// CinetPay appelle cette URL en POST avec un champ de formulaire "cpm_trans_id".
// Par sécurité (anti man-in-the-middle), on ne fait JAMAIS confiance à ce
// payload seul : on rappelle systématiquement l'API de vérification.
export async function POST(request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let transactionRef = null;

    if (contentType.includes("application/json")) {
      const body = await request.json();
      transactionRef = body.cpm_trans_id || body.transaction_id;
    } else {
      const form = await request.formData();
      transactionRef = form.get("cpm_trans_id");
    }

    if (!transactionRef) {
      return new Response("Missing transaction id", { status: 400 });
    }

    const db = supabaseAdmin();

    const { data: tx, error: txError } = await db
      .from("vote_transactions")
      .select("id, status")
      .eq("transaction_ref", transactionRef)
      .single();

    if (txError || !tx) {
      return new Response("Unknown transaction", { status: 404 });
    }

    // Déjà confirmée : on ne refait rien (le webhook peut être appelé plusieurs fois).
    if (tx.status === "confirmed") {
      return new Response("OK", { status: 200 });
    }

    const result = await verifyTransaction(transactionRef);

    await db
      .from("vote_transactions")
      .update({
        status: result.ok ? "confirmed" : "failed",
        payment_method: result.paymentMethod,
        provider_payload: result.raw,
        confirmed_at: result.ok ? new Date().toISOString() : null,
      })
      .eq("id", tx.id);

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Erreur webhook paiement:", err);
    // On répond 200 quand même pour éviter des retries infinis en boucle du
    // fournisseur en cas de bug transitoire côté logs ; l'essentiel est loggé.
    return new Response("OK", { status: 200 });
  }
}
