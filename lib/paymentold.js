// ============================================================================
// COUCHE DE PAIEMENT — KomiPay
//
// Couvre à la fois :
//  - Les Sociétés de Transfert d'Argent (STA) : NITA, Amana
//    → paiement asynchrone : le votant confirme dans son application,
//      on interroge ensuite KomiPay pour connaître le résultat.
//  - Les opérateurs mobile money : Airtel Money, Moov Flooz, Zamani Cash
//    → paiement généralement synchrone (résultat immédiat).
//
// Toute la logique spécifique à KomiPay est isolée ici. Pour changer de
// fournisseur plus tard, il suffit de réécrire ces fonctions en gardant
// la même signature.
// ============================================================================

const KOMIPAY_MOBILE_MONEY_BASE =
  process.env.KOMIPAY_ENV === "live"
    ? "https://www.komipay.com/APIs/mobile_money.php"
    : "http://sandbox.komipay.com:8181/APIs/mobile_money.php";

// L'endpoint generateToken vit directement sous mobile_money.php,
// tandis que les autres API (b2c_standard, check-transaction-status, etc.)
// vivent sous mobile_money.php/customers-api-kp/v1 — deux chemins de base
// différents, conformément à la documentation officielle KomiPay.
const KOMIPAY_BASE = `${KOMIPAY_MOBILE_MONEY_BASE}/customers-api-kp/v1`;

/**
 * Génère un jeton d'authentification KomiPay (valable 30 minutes).
 * Régénéré à chaque appel pour rester simple et robuste — le volume de
 * votes ne justifie pas la complexité d'un cache de token.
 */
export async function getKomipayToken() {
  const res = await fetch(`${KOMIPAY_MOBILE_MONEY_BASE}/generateToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: process.env.KOMIPAY_LOGIN,
      password: process.env.KOMIPAY_PASSWORD,
      api_key: process.env.KOMIPAY_API_KEY,
    }),
  });
  const data = await res.json();
  if (!data.statut) {
    throw new Error(`KomiPay: échec de génération du token — ${data.message}`);
  }
  return data.token;
}

/**
 * Démarre un paiement B2C Standard (mobile money opérateur ou STA).
 *
 * `provider` doit être l'une des valeurs KomiPay : "nita_transfert",
 * "amana_transfert", "airtel_money", "moov_flooz", "zamani_cash".
 */
export async function initiatePayment({ provider, amount, phone, reference, payerName }) {
  const token = await getKomipayToken();

  // Les STA (NITA/Amana) attendent le numéro AVEC l'indicatif pays (+227XXXXXXXX),
  // les opérateurs mobile money l'attendent SANS indicatif (XXXXXXXX).
  const isSTA = provider === "nita_transfert" || provider === "amana_transfert";
  const formattedPhone = isSTA ? `+227${phone}` : phone;

  const res = await fetch(`${KOMIPAY_BASE}/b2c_standard`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mobile_money: provider,
      api_key: process.env.KOMIPAY_API_KEY,
      montant_a_payer: String(amount),
      numero_telephone_payeur: formattedPhone,
      pays_payeur: "Niger",
      nom_prenom_payeur: payerName || "Votant InfluenceAward",
      reference_externe: reference,
    }),
  });

  const data = await res.json();

  if (!data.statut) {
    throw new Error(data.message || "Échec de l'initiation du paiement KomiPay.");
  }

  // STA (NITA/Amana) : la transaction reste "en attente" tant que le
  // votant n'a pas confirmé dans son application — on le signale via `pending`.
  const pending = /attente/i.test(data.message || "") || Boolean(data.code_achat);

  return {
    pending,
    referenceTransaction: data.reference_transaction,
    codeAchat: data.code_achat || null,
    message: data.message,
    raw: data,
  };
}

/**
 * Interroge KomiPay pour connaître le statut réel d'une transaction en attente.
 *
 * IMPORTANT : cette API KomiPay est conçue en "long polling" — si la
 * transaction est toujours en attente, elle peut mettre jusqu'à 5 minutes à
 * répondre. Pour rester compatible avec les limites de durée des fonctions
 * serverless (Vercel), on limite chaque appel à `timeoutMs` et on laisse le
 * frontend rappeler cette route plusieurs fois de suite jusqu'à résolution.
 */
export async function checkTransactionStatus(referenceTransaction, { timeoutMs = 8000 } = {}) {
  const token = await getKomipayToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${KOMIPAY_BASE}/check-transaction-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        apikey: process.env.KOMIPAY_API_KEY,
        reference_transaction: referenceTransaction,
      }),
      signal: controller.signal,
    });
    const data = await res.json();

    const transactionStatus = data.data?.transactionStatus;
    return {
      resolved: transactionStatus === "Success" || transactionStatus === "Echec",
      success: transactionStatus === "Success",
      raw: data,
    };
  } catch (err) {
    if (err.name === "AbortError") {
      return { resolved: false, success: false, timedOut: true };
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export const PAYMENT_PROVIDERS = [
  { code: "nita_transfert", label: "NITA", type: "sta" },
  { code: "amana_transfert", label: "Amana", type: "sta" },
  { code: "airtel_money", label: "Airtel Money", type: "telecom" },
  { code: "moov_flooz", label: "Moov Flooz", type: "telecom" },
  { code: "zamani_cash", label: "Zamani Cash", type: "telecom" },
];
