import { supabaseAdmin } from "@/lib/supabaseClient";
import { initiatePayment, initiateCardPayment, PAYMENT_PROVIDERS } from "@/lib/payment";

const VOTE_PRICE_FCFA = 100;
const MAX_VOTES_PER_TRANSACTION = 500;
const VALID_PROVIDERS = PAYMENT_PROVIDERS.map((p) => p.code);

function normalizePhone(raw) {
  let digits = String(raw).replace(/[\s.-]/g, "");
  if (digits.startsWith("+227")) digits = digits.slice(4);
  else if (digits.startsWith("227")) digits = digits.slice(3);
  return digits;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { categoryId, candidateId, provider, voteCount } = body;
    const isCard = provider === "bank_card";

    if (!categoryId || !candidateId || !provider) {
      return Response.json(
        { error: "categoryId, candidateId et provider sont requis." },
        { status: 400 }
      );
    }
    if (!isCard && !body.phone) {
      return Response.json({ error: "Le numéro de téléphone est requis." }, { status: 400 });
    }

    const count = Number.parseInt(voteCount, 10) || 1;
    if (count < 1 || count > MAX_VOTES_PER_TRANSACTION) {
      return Response.json(
        { error: `Le nombre de voix doit être entre 1 et ${MAX_VOTES_PER_TRANSACTION}.` },
        { status: 400 }
      );
    }

    if (!VALID_PROVIDERS.includes(provider)) {
      return Response.json({ error: "Moyen de paiement invalide." }, { status: 400 });
    }

    let normalizedPhone = null;
    if (!isCard) {
      normalizedPhone = normalizePhone(body.phone);
      if (!/^\d{8}$/.test(normalizedPhone)) {
        return Response.json(
          { error: "Numéro de téléphone invalide (8 chiffres attendus)." },
          { status: 400 }
        );
      }
    }

    if (isCard) {
      const { cardNumber, expiry, cvv, cardHolderName } = body;
      if (!cardNumber || !expiry || !cvv || !cardHolderName) {
        return Response.json(
          { error: "Tous les champs de la carte bancaire sont requis." },
          { status: 400 }
        );
      }
    }

    const totalAmount = count * VOTE_PRICE_FCFA;

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
      // Aucune donnée de carte n'est jamais stockée ici — seulement le
      // téléphone pour les moyens mobile money, ou "carte" en repère pour les paiements carte.
      phone_number: normalizedPhone || "carte",
      vote_count: count,
      amount: totalAmount,
      status: "pending",
      payment_provider: provider,
    });

    if (insertError) throw insertError;

    let paymentResult;
    try {
      if (isCard) {
        const { cardNumber, expiry, cvv, cardHolderName, browserInfo } = body;
        paymentResult = await initiateCardPayment({
          amount: totalAmount,
          reference: transactionRef,
          payerName: cardHolderName,
          cardNumber,
          expiry,
          cvv,
          browserInfo,
        });
      } else {
        paymentResult = await initiatePayment({
          provider,
          amount: totalAmount,
          phone: normalizedPhone,
          reference: transactionRef,
          payerName: "Votant InfluenceAward",
        });
      }
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
        code_achat: paymentResult.codeAchat || null,
        provider_payload: paymentResult.raw,
        // Les opérateurs mobile money / cartes sans 3DS peuvent confirmer immédiatement.
        ...(paymentResult.pending
          ? {}
          : { status: "confirmed", confirmed_at: new Date().toISOString() }),
      })
      .eq("transaction_ref", transactionRef);

    return Response.json({
      transactionRef,
      pending: paymentResult.pending,
      codeAchat: paymentResult.codeAchat || null,
      redirectUrl: paymentResult.redirectUrl || null,
      message: paymentResult.message,
    });
  } catch (err) {
    console.error("Erreur initiation vote:", err);
    return Response.json({ error: "Une erreur est survenue. Réessayez." }, { status: 500 });
  }
}
