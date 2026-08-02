import { supabaseAdmin } from "@/lib/supabaseClient";
import { requireAdmin } from "@/lib/adminAuth";
import { checkTransactionStatus } from "@/lib/payment";

export async function GET(request) {
  const email = await requireAdmin(request);
  if (!email) return Response.json({ error: "Accès refusé." }, { status: 403 });

  const db = supabaseAdmin();

  // On regarde à la fois les "pending" (cas normal) et les "failed"
  // (au cas où une vérification précédente se serait trompée, ou si le
  // paiement a fini par être validé après un premier échec apparent).
  //
  // Supabase/PostgREST plafonne à 1000 lignes par requête même sans
  // .limit() explicite — on pagine donc avec .range() jusqu'à avoir tout
  // récupéré, au lieu de couper arbitrairement à 300.
  const PAGE_SIZE = 1000;
  const candidates = [];
  let page = 0;

  while (true) {
    const { data: pageData, error } = await db
      .from("vote_transactions")
      .select(
        "id, transaction_ref, category_id, candidate_id, phone_number, vote_count, amount, status, payment_provider, provider_reference, created_at, candidates(name)"
      )
      .in("status", ["pending", "failed"])
      .not("provider_reference", "is", null)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    candidates.push(...pageData);
    if (pageData.length < PAGE_SIZE) break;
    page++;
  }

  const mismatches = [];
  let errored = 0;

  // On vérifie les transactions par lots (au lieu d'une par une) pour que
  // ça reste rapide, sans pour autant envoyer des centaines de requêtes
  // simultanées à KomiPay (qui se mettrait alors à répondre vide ou à
  // couper la connexion).
  const CONCURRENCY = 10;
  const queue = [...candidates];

  async function worker() {
    while (queue.length > 0) {
      const tx = queue.shift();
      if (!tx) break;
      try {
        const result = await checkTransactionStatus(tx.provider_reference, { timeoutMs: 8000 });
        if (result.error) {
          errored++;
          console.error(`Erreur vérification ${tx.transaction_ref}:`, result.error);
          continue;
        }
        if (result.resolved && result.success) {
          mismatches.push({
            id: tx.id,
            transactionRef: tx.transaction_ref,
            candidateName: tx.candidates?.name || "—",
            categoryId: tx.category_id,
            phone: tx.phone_number,
            voteCount: tx.vote_count,
            amount: tx.amount,
            provider: tx.payment_provider,
            dbStatus: tx.status,
            createdAt: tx.created_at,
          });
        }
      } catch (err) {
        errored++;
        console.error(`Erreur vérification ${tx.transaction_ref}:`, err.message);
        // On l'ignore ici — l'admin peut relancer le chargement, et le cron
        // de réconciliation automatique la rattrapera.
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  return Response.json({
    mismatches,
    checked: candidates.length,
    errored,
  });
}
