// ============================================================================
// COUCHE DE PAIEMENT — KomiPay
//
// Couvre :
//  - Les Sociétés de Transfert d'Argent (STA) : NITA, Amana
//    → paiement asynchrone : le client confirme dans son application,
//      on interroge ensuite KomiPay pour connaître le résultat.
//  - Les opérateurs mobile money : Airtel Money, Moov Flooz, Zamani Cash
//    → paiement généralement synchrone (résultat immédiat).
//  - La carte bancaire (Visa/Mastercard), avec défi 3D Secure éventuel.
//
// Générique : ne connaît rien du métier de l'app qui l'utilise (pas de
// "vote", "candidat", etc.) — juste amount / phone / provider / reference.
// ============================================================================

const KOMIPAY_MOBILE_MONEY_BASE =
  process.env.KOMIPAY_ENV === "live"
    ? "https://www.komipay.com/APIs/mobile_money.php"
    : "http://sandbox.komipay.com:8181/APIs/mobile_money.php";

// L'endpoint generateToken vit directement sous mobile_money.php,
// tandis que les autres API vivent sous mobile_money.php/customers-api-kp/v1.
const KOMIPAY_BASE = `${KOMIPAY_MOBILE_MONEY_BASE}/customers-api-kp/v1`;

/**
 * Lit une réponse fetch en JSON de façon sûre. KomiPay peut renvoyer un
 * corps vide ou non-JSON (timeout côté serveur, erreur passerelle, etc.) —
 * dans ce cas on lève une erreur explicite plutôt que de laisser
 * `res.json()` planter avec "Unexpected end of JSON input".
 */
async function safeJson(res) {
  const text = await res.text();
  if (!text) {
    throw new Error(
      `KomiPay: réponse vide (HTTP ${res.status}) — le service a probablement timeout côté serveur.`
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `KomiPay: réponse non-JSON (HTTP ${res.status}) — ${text.slice(0, 200)}`
    );
  }
}

// Le token KomiPay est valable 30 minutes. On le met en cache en mémoire
// pour éviter d'en régénérer un à chaque appel (ce qui, sur une boucle de
// centaines de transactions, doublait le nombre de requêtes et augmentait
// le risque d'erreurs réseau côté KomiPay).
let cachedToken = null;
let cachedTokenExpiresAt = 0;
const TOKEN_TTL_MS = 25 * 60 * 1000; // marge de sécurité sur les 30 min annoncées

/**
 * Génère (ou réutilise) un jeton d'authentification KomiPay.
 * Passe `forceRefresh: true` pour forcer une régénération (ex: après un
 * rejet d'authentification par KomiPay avec le token en cache).
 */
export async function getKomipayToken({ forceRefresh = false } = {}) {
  if (!forceRefresh && cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch(`${KOMIPAY_MOBILE_MONEY_BASE}/generateToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: process.env.KOMIPAY_LOGIN,
      password: process.env.KOMIPAY_PASSWORD,
      api_key: process.env.KOMIPAY_API_KEY,
    }),
  });
  const data = await safeJson(res);
  if (!data.statut) {
    throw new Error(`KomiPay: échec de génération du token — ${data.message}`);
  }

  cachedToken = data.token;
  cachedTokenExpiresAt = Date.now() + TOKEN_TTL_MS;
  return cachedToken;
}

/**
 * Démarre un paiement B2C Standard (mobile money opérateur ou STA).
 * `provider` : "nita_transfert" | "amana_transfert" | "airtel_money" |
 *              "moov_flooz" | "zamani_cash"
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
      nom_prenom_payeur: payerName || "Client",
      reference_externe: reference,
    }),
  });

  const data = await safeJson(res);

  if (!data.statut) {
    throw new Error(data.message || "Échec de l'initiation du paiement KomiPay.");
  }

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
 * Chiffre le CVV avant de l'envoyer avec le paiement carte — jamais le CVV
 * en clair au-delà de cette étape, conformément aux exigences KomiPay/PCI-DSS.
 */
async function encryptCvv(token, cvv) {
  const res = await fetch(`${KOMIPAY_BASE}/crypt-cvv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      keypass: process.env.KOMIPAY_KEYPASS,
    },
    body: JSON.stringify({
      api_key: process.env.KOMIPAY_API_KEY,
      cvv_number: cvv,
    }),
  });
  const data = await safeJson(res);
  if (!data.statut) {
    throw new Error(data.message || "Échec du chiffrement du CVV.");
  }
  return data.cvv_encrpyt;
}

/**
 * Démarre un paiement par carte bancaire (Visa / MasterCard).
 * Un défi 3D Secure peut être exigé : dans ce cas KomiPay renvoie
 * `redirectUrl`, à charger dans une iframe/webview pendant qu'on sonde le
 * statut via `checkTransactionStatus`, comme pour NITA/Amana.
 *
 * SÉCURITÉ : numéro de carte et CVV ne doivent JAMAIS être stockés ni
 * journalisés — uniquement transmis à KomiPay puis oubliés.
 */
export async function initiateCardPayment({
  amount,
  reference,
  payerName,
  cardNumber,
  expiry,
  cvv,
  browserInfo,
}) {
  const token = await getKomipayToken();
  const cvvEncrypted = await encryptCvv(token, cvv);

  const res = await fetch(`${KOMIPAY_BASE}/b2c_standard`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      keypass: process.env.KOMIPAY_KEYPASS,
    },
    body: JSON.stringify({
      mobile_money: "bank_card",
      api_key: process.env.KOMIPAY_API_KEY,
      nom_prenom_payeur: payerName || "Client",
      numero_carte_bancaire: cardNumber,
      date_expiration: expiry,
      cvv_number: cvvEncrypted,
      montant_a_payer: String(amount),
      reference_externe: reference,
      javaEnabled: browserInfo?.javaEnabled ?? false,
      javascriptEnabled: browserInfo?.javascriptEnabled ?? true,
      screenHeight: String(browserInfo?.screenHeight ?? "800"),
      screenWidth: String(browserInfo?.screenWidth ?? "400"),
      TZ: String(browserInfo?.TZ ?? "0"),
      challengeWindowSize: browserInfo?.challengeWindowSize ?? "05",
    }),
  });

  const data = await safeJson(res);

  if (!data.statut) {
    throw new Error(data.message || "Échec du paiement par carte.");
  }

  const pending = data.etat === "ATTENTE";

  return {
    pending,
    referenceTransaction: data.dataTransaction?.reference_transaction,
    redirectUrl: data.redirect_portail_auth || null,
    message: data.message,
    raw: data,
  };
}

/**
 * Interroge KomiPay pour connaître le statut réel d'une transaction en attente.
 * Long-polling côté KomiPay (jusqu'à 5 min) — on limite chaque appel à
 * `timeoutMs` et on laisse l'appelant (app mobile ou backend) réessayer.
 */
export async function checkTransactionStatus(
  referenceTransaction,
  { timeoutMs = 8000, _retryOnAuthFailure = true } = {}
) {
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

    // Un token expiré/rejeté renvoie généralement un 401/403 avec un corps
    // vide ou non-JSON. On force un nouveau token et on retente une fois
    // avant d'abandonner, plutôt que de remonter une erreur de parsing.
    if ((res.status === 401 || res.status === 403) && _retryOnAuthFailure) {
      await getKomipayToken({ forceRefresh: true });
      return checkTransactionStatus(referenceTransaction, {
        timeoutMs,
        _retryOnAuthFailure: false,
      });
    }

    const data = await safeJson(res);

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
    return { resolved: false, success: false, error: err.message };
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
  { code: "bank_card", label: "Carte bancaire (Visa/Mastercard)", type: "card" },
];
