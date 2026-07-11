import { supabaseAdmin } from "@/lib/supabaseClient";
import { initiatePayment, PAYMENT_PROVIDERS } from "@/lib/payment";

const VOTE_PRICE_FCFA = 100;
const VALID_PROVIDERS = PAYMENT_PROVIDERS.map((p) => p.code);

function normalizePhone(raw) {
  let digits = String(raw).replace(/[\s.-]/g, "");
  if (digits.startsWith("+227")) digits = digits.slice(4);
  else if (digits.startsWith("227")) digits = digits.slice(3);
  return digits;
}

export async function POST(request) {
  try {
    const { categoryId, candidateId, phone, provider } = await request.json();

    if (!categoryId || !candidateId || !phone || !provider) {
      return Response.json(
        { error: "categoryId, candidateId, phone et provider sont requis." },
        { status: 400 }
      );
    }

    if (!VALID_PROVIDERS.includes(provider)) {
      return Response.json({ error: "Moyen de paiement invalide." }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!/^\d{8}$/.test(normalizedPhone)) {
      return Response.json(
        { error: "Numéro de téléphone invalide (8 chiffres attendus)." },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    const { data: candidate, error: candidateError } = await db
      .from("candidates")
      .select("id, name, category_id")
      .eq("id", candidateId)
      .single();

    if (candidateError || !candidate || candidate.category_id !== categoryId) {
      return Response.json({ error: "Candidat invalide." }, { status: 400 });
    }

    const transactionRef = `IA-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const { error: insertError } = await db.from("vote_transactions").insert({
      transaction_ref: transactionRef,
      category_id: categoryId,
      candidate_id: candidateId,
      phone_number: normalizedPhone,
      amount: VOTE_PRICE_FCFA,
      status: "pending",
      payment_provider: provider,
    });

    if (insertError) throw insertError;

    let paymentResult;
    try {
      paymentResult = await initiatePayment({
        provider,
        amount: VOTE_PRICE_FCFA,
        phone: normalizedPhone,
        reference: transactionRef,
        payerName: "Votant InfluenceAward",
      });
    } catch (paymentError) {
      await db
        .from("vote_transactions")
        .update({ status: "failed", provider_payload: { error: paymentError.message } })
        .eq("transaction_ref", transactionRef);
      return Response.json({ error: paymentError.message }, { status: 502 });
    }

    await db
      .from("vote_transactions")
      .update({
        provider_reference: paymentResult.referenceTransaction,
        code_achat: paymentResult.codeAchat,
        provider_payload: paymentResult.raw,
        // Les opérateurs mobile money peuvent confirmer immédiatement.
        ...(paymentResult.pending
          ? {}
          : { status: "confirmed", confirmed_at: new Date().toISOString() }),
      })
      .eq("transaction_ref", transactionRef);

    return Response.json({
      transactionRef,
      pending: paymentResult.pending,
      codeAchat: paymentResult.codeAchat,
      message: paymentResult.message,
    });
  } catch (err) {
    console.error("Erreur initiation vote:", err);
    return Response.json({ error: "Une erreur est survenue. Réessayez." }, { status: 500 });
  }
}
