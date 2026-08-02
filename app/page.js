"use client";

import { useState, useEffect } from "react";
import { supabasePublic } from "@/lib/supabaseClient";

const VOTE_PRICE_FCFA = 100;

function normalizePhone(raw) {
  let digits = raw.replace(/[\s.-]/g, "");
  if (digits.startsWith("+227")) digits = digits.slice(4);
  else if (digits.startsWith("227")) digits = digits.slice(3);
  return digits;
}
function isValidPhone(raw) {
  return /^\d{8}$/.test(normalizePhone(raw));
}

const PROVIDERS = [
  { code: "nita_transfert", label: "NITA" },
  { code: "amana_transfert", label: "Amana" },
  { code: "airtel_money", label: "Airtel Money" },
  { code: "moov_flooz", label: "Moov Flooz" },
  { code: "zamani_cash", label: "Zamani Cash" },
  { code: "bank_card", label: "Carte bancaire (Visa/Mastercard)" },
];

function getCodeFromDimensions(width, height) {
  if (width <= 250 && height <= 400) return "01";
  if (width <= 390 && height <= 400) return "02";
  if (width <= 500 && height <= 600) return "03";
  if (width <= 600 && height <= 400) return "04";
  return "05";
}

function getBrowserInfo() {
  if (typeof window === "undefined") return {};
  return {
    javaEnabled: false,
    javascriptEnabled: true,
    screenHeight: window.screen.height,
    screenWidth: window.screen.width,
    TZ: new Date().getTimezoneOffset() / -60,
    challengeWindowSize: getCodeFromDimensions(window.screen.width, window.screen.height),
  };
}

function formatCardNumber(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  return digits.match(/.{1,4}/g)?.join("-") || digits;
}

export default function VotePage() {
  const PETAL_COLORS = ["#C69A2A", "#B4182F", "#E8B84B", "#D98C4A"];
  const petals = Array.from({ length: 16 }).map((_, i) => ({
    left: (i * 6.2) % 100,
    delay: (i % 9) * 1.3,
    duration: 10 + (i % 6) * 1.8,
    color: PETAL_COLORS[i % PETAL_COLORS.length],
  }));

  const [categories, setCategories] = useState([]);
  const [candidatesByCategory, setCandidatesByCategory] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [voteCounts, setVoteCounts] = useState({}); // { candidateId: votes }
  const [partners, setPartners] = useState([]);
  const [provider, setProvider] = useState("nita_transfert");
  const [voteCount, setVoteCount] = useState(1);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [voteModalCandidate, setVoteModalCandidate] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [cardHolderName, setCardHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [threeDsUrl, setThreeDsUrl] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: cats, error: catErr } = await supabasePublic
        .from("categories")
        .select("*")
        .order("sort_order");
      const { data: cands, error: candErr } = await supabasePublic
        .from("candidates")
        .select("*")
        .order("sort_order");
      const { data: partnersData } = await supabasePublic
        .from("partners")
        .select("*")
        .order("sort_order");

      if (catErr || candErr) {
        setError("Impossible de charger les catégories.");
        setLoading(false);
        return;
      }

      const grouped = {};
      for (const c of cands) {
        grouped[c.category_id] = grouped[c.category_id] || [];
        grouped[c.category_id].push(c);
      }

      setCategories(cats);
      setCandidatesByCategory(grouped);
      setPartners(partnersData || []);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    async function loadLeaderboard() {
      const { data, error } = await supabasePublic
        .from("public_leaderboard")
        .select("*")
        .order("votes", { ascending: false });
      if (!error && data) {
        setLeaderboard(data.slice(0, 5));
        const counts = {};
        for (const row of data) counts[row.candidate_id] = row.votes;
        setVoteCounts(counts);
      }
    }
    loadLeaderboard();
    const interval = setInterval(loadLeaderboard, 10000);
    return () => clearInterval(interval);
  }, []);

  function openVoteModal(candidate) {
    setVoteModalCandidate(candidate);
    setVoteCount(1);
    setPhoneError(null);
    setCardHolderName("");
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setThreeDsUrl(null);
  }

  async function handleVote() {
    if (!voteModalCandidate) return;
    setPhoneError(null);

    const isCard = provider === "bank_card";

    if (!isCard && !isValidPhone(phone)) {
      setPhoneError("Entrez un numéro valide (8 chiffres, ex : 90 12 34 56).");
      return;
    }
    if (isCard) {
      const digits = cardNumber.replace(/\D/g, "");
      if (!cardHolderName.trim()) {
        setPhoneError("Entrez le nom du titulaire de la carte.");
        return;
      }
      if (digits.length !== 16) {
        setPhoneError("Numéro de carte invalide (16 chiffres).");
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
        setPhoneError("Date d'expiration invalide (format MM/AA).");
        return;
      }
      if (!/^\d{3}$/.test(cardCvv)) {
        setPhoneError("CVV invalide (3 chiffres).");
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        categoryId: voteModalCandidate.category_id,
        candidateId: voteModalCandidate.id,
        provider,
        voteCount,
      };
      if (isCard) {
        payload.cardHolderName = cardHolderName;
        payload.cardNumber = cardNumber;
        payload.expiry = cardExpiry;
        payload.cvv = cardCvv;
        payload.browserInfo = getBrowserInfo();
      } else {
        payload.phone = phone;
      }

      const res = await fetch("/api/votes/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      // On efface immédiatement les champs sensibles de la carte, qu'il y ait
      // succès ou échec — ils ne doivent jamais rester en mémoire plus longtemps.
      if (isCard) {
        setCardNumber("");
        setCardCvv("");
        setCardExpiry("");
      }

      if (!res.ok) {
        setPhoneError(data.error || "Le vote a échoué.");
        return;
      }

      if (!data.pending) {
        window.location.href = "/vote/merci";
        return;
      }

      setVoteModalCandidate(null);
      setPendingPayment({
        transactionRef: data.transactionRef,
        codeAchat: data.codeAchat,
        message: data.message,
        provider,
      });
      setThreeDsUrl(data.redirectUrl || null);
      setPendingStatus("pending");
    } catch (e) {
      setError("Connexion impossible. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  // Sondage du statut tant qu'un paiement STA est en attente.
  useEffect(() => {
    if (!pendingPayment || pendingStatus !== "pending") return;

    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/votes/check-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionRef: pendingPayment.transactionRef }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "confirmed") {
          window.location.href = "/vote/merci";
        } else if (data.status === "failed") {
          setPendingStatus("failed");
        }
      } catch (e) {
        // erreur réseau ponctuelle : on retentera au prochain intervalle
      }
    }

    const interval = setInterval(poll, 6000);
    poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pendingPayment, pendingStatus]);

  const categoryLeaders = categories
    .map((cat) => {
      const cands = candidatesByCategory[cat.id] || [];
      if (cands.length === 0) return null;
      const top = [...cands].sort(
        (a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0)
      )[0];
      return { category: cat, candidate: top, votes: voteCounts[top.id] || 0 };
    })
    .filter(Boolean);

  return (
    <div style={styles.page}>
      <div style={styles.petalsLayer} aria-hidden="true">
        {petals.map((p, i) => (
          <span
            key={i}
            className="petal"
            style={{
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
      </div>

      <header style={styles.hero}>
        <div className="spotlight-corner spotlight-left" aria-hidden="true" />
        <div className="spotlight-corner spotlight-right" aria-hidden="true" />
        <img src="/images/logo.png" alt="INFLUENCE AWARD" style={styles.heroLogo} />
       <p style={styles.categoryTitle}>Dosso · 2026</p>
        <p style={styles.heroSubtitle}>
          Votez pour les jeunes talents qui inspirent la jeunesse d'aujourd'hui
          et de demain. 100 FCFA par voix.
        </p>
        <button style={styles.infoButton} onClick={() => setShowInfoModal(true)}>
          En savoir plus
        </button>
      </header>

      {/*ategoryLeaders.length > 0 && (
        <section style={styles.leaderboardSection}>
          {/*<img src="/images/gold-trophy.png" alt="" style={styles.trophyIcon} />}
          <p style={styles.eyebrow}>En tête, par catégorie</p>
          <div className="candidates-grid" style={styles.leaderGrid}>
            {categoryLeaders.map(({ category, candidate, votes }) => (
              <div key={category.id} style={styles.leaderCard} className="leaderboard-first">
                <img src="/images/gold-trophy.png" alt="" style={styles.leaderBadge} />
                <div style={styles.leaderCardPhotoWrap}>
                  <img
                    src={
                      candidate.photo_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        candidate.name
                      )}&background=C69A2A&color=FAF7F0&size=256`
                    }
                    alt={candidate.name}
                    style={styles.leaderCardPhoto}
                  />
                </div>
                <p style={styles.leaderCardCategory}>{category.label}</p>
                <p style={styles.leaderCardName}>{candidate.name}</p>
                <p style={styles.leaderCardVotes}>{votes} voix</p>
              </div>
            ))}
          </div>
        </section>
      )*/}

      <main style={styles.main}>
        {error && <div style={styles.errorBanner}>{error}</div>}

        {loading ? (
          <div style={styles.loaderBox}>
            <div style={styles.loaderSpinner} />
            <p style={styles.loaderText}>Chargement des nominés…</p>
          </div>
        ) : (
          <div style={styles.nomineesBanner}>
            <span>Les Nominés</span>
          </div>
        )}

        {!loading &&
          categories.map((cat) => {
            const catCandidates = candidatesByCategory[cat.id] || [];
            if (catCandidates.length === 0) return null;

            const sortedCandidates = [...catCandidates].sort(
              (a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0)
            );
            const topVotes = voteCounts[sortedCandidates[0]?.id] || 0;

            return (
              <section key={cat.id} style={styles.categorySection}>
                <h2 style={styles.categoryTitle}>{cat.label}</h2>
                <div className="candidates-grid">
                  {sortedCandidates.map((c) => {
                    const votes = voteCounts[c.id] || 0;
                    const isLeader = topVotes > 0 && votes === topVotes;
                    return (
                      <div key={c.id} style={styles.card} className="candidate-card">
                        {isLeader && (
                          <img src="/images/leader-trophy.png" alt="" style={styles.leaderBadge} />
                        )}
                        <div
                          className="candidate-photo-wrap"
                          style={isLeader ? styles.candidatePhotoWrapLeader : undefined}
                        >
                          <img
                            src={
                              c.photo_url ||
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                c.name
                              )}&background=C69A2A&color=FAF7F0&size=256`
                            }
                            alt={c.name}
                          />
                        </div>
                        <h3 style={styles.candidateName}>
                          {c.name} <span style={styles.candidateVotes}>({votes} voix)</span>
                        </h3>
                        
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </main>

      {loading ? (
          <div style={styles.loaderBox}>
            <div />
            <p style={styles.loaderText}></p>
          </div>
        ) : (
          <div style={styles.nomineesBanner}>
            <span>Nos partenaires</span>
          </div>
        )}

        {partners.length > 0 && (
        <div className="partners-marquee" style={styles.partnersMarquee}>
          <div className="partners-track">
            {[...partners, ...partners].map((p, i) => (
              <div key={i} style={styles.partnerBadge}>
                {p.logo_url ? (
                  <img src={p.logo_url} alt={p.name} style={styles.partnerLogoImg} />
                ) : (
                  <span style={styles.partnerBadgeText}>{p.name}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <footer style={styles.footer}>
        <p style={styles.footerText}>
          Dévéloppé par Rahma Group Code - Tous droit réservé
        </p>
      </footer>

      {showInfoModal && (
        <div style={styles.modalOverlay} onClick={() => setShowInfoModal(false)}>
          <div
            style={styles.infoModalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.infoCloseButton}
              onClick={() => setShowInfoModal(false)}
              aria-label="Fermer"
            >
              ✕
            </button>

            <img src="/images/logo.png" alt="INFLUENCE AWARD" style={styles.infoModalLogo} />

            <h2 style={styles.infoSectionTitle}>Présentation</h2>
            <p style={styles.infoText}>
              INFLUENCE AWARD est un évènement dédié à la valorisation des jeunes talents et
              acteurs influents de la région de Dosso.
            </p>
            <p style={styles.infoText}>
              À travers cet événement, nous mettons en lumière les créateurs de contenu,
              entrepreneurs, comédiens, animateurs, photographes, sportifs, artistes et jeunes
              leaders qui impactent positivement leur communauté par leur créativité, leur
              engagement et leur innovation.
            </p>
            <p style={styles.infoText}>
              Plus qu'une cérémonie de distinction, INFLUENCE AWARD se veut une véritable
              plateforme d'inspiration, de visibilité et de célébration de l'excellence jeunesse
              et la promotion de la culture Nigérienne.
            </p>
            <p style={styles.infoText}>
              L'événement réunira un public jeune, dynamique et connecté autour d'une soirée
              exceptionnelle mêlant distinctions, culture, networking et hommage au patrimoine
              local.
            </p>

            <h2 style={styles.infoSectionTitle}>Objectif</h2>
            <p style={styles.infoText}>
              L'objectif est de promouvoir une influence positive, encourager les initiatives
              locales et offrir une reconnaissance méritée aux talents qui inspirent la jeunesse
              d'aujourd'hui et de demain.
            </p>

            <h2 style={styles.infoSectionTitle}>Règlement des votes</h2>
            <p style={styles.infoText}>
              Les votes organisés dans le cadre de INFLUENCE AWARD ont pour objectif de
              distinguer les candidats qui se démarquent par leur talent, leur impact et leur
              influence positive.
            </p>
            <p style={styles.infoText}>
              Le comité d'organisation s'engage à garantir un processus de vote transparent,
              équitable et sécurisé.
            </p>
            <p style={styles.infoText}>
              Toute tentative de fraude, de manipulation des votes, d'utilisation de moyens
              illicites ou de contournement du système entraînera l'annulation des votes
              concernés et pourra conduire à la disqualification du candidat ou de toute
              personne impliquée.
            </p>
            <p style={styles.infoText}>
              En participant aux votes, chaque utilisateur s'engage à respecter le présent
              règlement et les principes d'intégrité qui fondent INFLUENCE AWARD.
            </p>

            <h2 style={styles.infoSectionTitle}>Contact</h2>
            <p style={styles.infoText}>Numéro : +227 92 66 29 30 / 86 72 12 55</p>
            <div style={styles.infoLinks}>
              <a
                href="https://www.facebook.com/share/p/18dGqxm8rF/"
                target="_blank"
                rel="noopener noreferrer"
                style={styles.infoLink}
              >
                Facebook
              </a>
              <a
                href="https://www.tiktok.com/@influence.award?_r=1&_t=ZS-96CH1iY1S1E"
                target="_blank"
                rel="noopener noreferrer"
                style={styles.infoLink}
              >
                TikTok
              </a>
              <a
                href="https://whatsapp.com/channel/0029VbCnevG2v1IyCqBgOY1z"
                target="_blank"
                rel="noopener noreferrer"
                style={styles.infoLink}
              >
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {voteModalCandidate && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={styles.modalTitle}>Voter pour {voteModalCandidate.name}</h3>
            <p style={styles.modalText}>{VOTE_PRICE_FCFA} FCFA par voix.</p>

            <div style={{ textAlign: "left", marginBottom: "1rem" }}>
              <label style={styles.phoneLabel}>Nombre de voix</label>
              <div style={styles.stepperRow}>
                <button
                  type="button"
                  style={styles.stepperButton}
                  onClick={() => setVoteCount((n) => Math.max(1, n - 1))}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={voteCount}
                  onChange={(e) => {
                    const v = Number.parseInt(e.target.value, 10);
                    setVoteCount(Number.isFinite(v) && v > 0 ? Math.min(v, 500) : 1);
                  }}
                  style={styles.stepperInput}
                />
                <button
                  type="button"
                  style={styles.stepperButton}
                  onClick={() => setVoteCount((n) => Math.min(500, n + 1))}
                >
                  +
                </button>
              </div>
              <p style={styles.totalPriceText}>
                Total : <strong>{voteCount * VOTE_PRICE_FCFA} FCFA</strong>
              </p>

              <label style={styles.phoneLabel} htmlFor="modal-provider-select">
                Moyen de paiement
              </label>
              <select
                id="modal-provider-select"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setPhoneError(null);
                }}
                style={styles.phoneInput}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>

              {provider === "bank_card" ? (
                <>
                  <label style={styles.phoneLabel} htmlFor="modal-card-name">
                    Nom du titulaire
                  </label>
                  <input
                    id="modal-card-name"
                    type="text"
                    placeholder="NOM Prénom"
                    value={cardHolderName}
                    onChange={(e) => setCardHolderName(e.target.value)}
                    style={styles.phoneInput}
                    autoFocus
                  />

                  <label style={styles.phoneLabel} htmlFor="modal-card-number">
                    Numéro de carte
                  </label>
                  <input
                    id="modal-card-number"
                    type="text"
                    inputMode="numeric"
                    placeholder="1234-5678-1234-5678"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    style={styles.phoneInput}
                    maxLength={19}
                  />

                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <div style={{ flex: 1 }}>
                      <label style={styles.phoneLabel} htmlFor="modal-card-expiry">
                        Expiration (MM/AA)
                      </label>
                      <input
                        id="modal-card-expiry"
                        type="text"
                        placeholder="12/28"
                        value={cardExpiry}
                        onChange={(e) => {
                          let v = e.target.value.replace(/\D/g, "").slice(0, 4);
                          if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2)}`;
                          setCardExpiry(v);
                        }}
                        style={styles.phoneInput}
                        maxLength={5}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={styles.phoneLabel} htmlFor="modal-card-cvv">
                        CVV
                      </label>
                      <input
                        id="modal-card-cvv"
                        type="password"
                        inputMode="numeric"
                        placeholder="123"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 3))}
                        style={styles.phoneInput}
                        maxLength={3}
                      />
                    </div>
                  </div>
                  <p style={styles.modalHint}>
                    Vos données bancaires sont transmises directement à KomiPay et ne sont jamais
                    conservées sur ce site.
                  </p>
                </>
              ) : (
                <>
                  <label style={styles.phoneLabel} htmlFor="modal-phone-input">
                    Numéro de téléphone
                  </label>
                  <input
                    id="modal-phone-input"
                    type="tel"
                    inputMode="numeric"
                    placeholder="90 12 34 56"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setPhoneError(null);
                    }}
                    style={styles.phoneInput}
                    autoFocus
                  />
                </>
              )}

              {phoneError && <p style={styles.phoneError}>{phoneError}</p>}
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                style={{ ...styles.voteButton, flex: 1 }}
                onClick={handleVote}
                disabled={submitting}
              >
                {submitting ? "Envoi…" : `Confirmer (${voteCount * VOTE_PRICE_FCFA} FCFA)`}
              </button>
              <button
                style={styles.modalCancelButton}
                onClick={() => {
                  setVoteModalCandidate(null);
                  setPhoneError(null);
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingPayment && (
        <div style={styles.modalOverlay}>
          <div style={threeDsUrl ? styles.modalCardWide : styles.modalCard}>
            {pendingStatus === "pending" && threeDsUrl && (
              <>
                <h3 style={styles.modalTitle}>Vérification de sécurité (3D Secure)</h3>
                <p style={styles.modalText}>
                  Votre banque demande une vérification supplémentaire. Complétez-la ci-dessous.
                </p>
                <iframe
                  src={threeDsUrl}
                  title="Vérification 3D Secure"
                  style={styles.threeDsFrame}
                />
                <p style={styles.modalHint}>
                  Cette fenêtre se met à jour automatiquement une fois la vérification terminée.
                </p>
              </>
            )}
            {pendingStatus === "pending" && !threeDsUrl && (
              <>
                <div style={styles.modalSpinner} />
                <h3 style={styles.modalTitle}>Confirmez votre paiement</h3>
                <p style={styles.modalText}>
                  Ouvrez votre application{" "}
                  <strong>
                    {PROVIDERS.find((p) => p.code === pendingPayment.provider)?.label}
                  </strong>{" "}
                  et validez la transaction.
                </p>
                {pendingPayment.codeAchat && (
                  <div style={styles.codeAchatBox}>
                    <p style={styles.codeAchatLabel}>Code de confirmation</p>
                    <p style={styles.codeAchatValue}>{pendingPayment.codeAchat}</p>
                  </div>
                )}
                <p style={styles.modalHint}>
                  Cette fenêtre se met à jour automatiquement dès que le paiement est confirmé.
                </p>
              </>
            )}
            {pendingStatus === "failed" && (
              <>
                <h3 style={styles.modalTitle}>Paiement échoué</h3>
                <p style={styles.modalText}>
                  Le paiement n'a pas pu être confirmé. Vous pouvez réessayer.
                </p>
                <button
                  style={styles.voteButton}
                  onClick={() => {
                    setPendingPayment(null);
                    setPendingStatus(null);
                    setThreeDsUrl(null);
                  }}
                >
                  Réessayer
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// STYLES — thème clair, accents or & rouge
// ---------------------------------------------------------------------------
const colors = {
  bg: "#FAF7F0",
  card: "#FFFFFF",
  border: "#E9E1CC",
  ink: "#221A12",
  inkDim: "#786C5A",
  gold: "#B8891E",
  goldLight: "#E8B84B",
  red: "#B4182F",
  redDark: "#8C1225",
};

const styles = {
  page: {
    position: "relative",
    zIndex: 0,
    minHeight: "100vh",
    background: colors.bg,
    color: colors.ink,
    fontFamily: "'Sora', sans-serif",
    paddingBottom: "3rem",
    overflow: "hidden",
  },
  petalsLayer: {
    position: "fixed",
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: -1,
  },
  hero: {
    position: "relative",
    textAlign: "center",
    padding: "1rem 1.5rem 2rem",
    overflow: "hidden",
  },
  eyebrow: {
    fontFamily: "'Space Mono', monospace",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontSize: "0.72rem",
    color: colors.red,
    fontWeight: 700,
    marginBottom: "0.5rem",
  },
  heroLogo: {
    maxWidth: "min(90%, 480px)",
    height: "auto",
    margin: "0 auto",
    display: "block",
    position: "relative",
    zIndex: 1,
    filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.15))",
  },
  heroSubtitle: {
    maxWidth: "440px",
    margin: "1rem auto 0",
    color: colors.inkDim,
    lineHeight: 1.5,
    fontSize: "0.95rem",
  },
  infoButton: {
    marginTop: "1.25rem",
    padding: "0.55rem 1.5rem",
    borderRadius: "999px",
    border: `1px solid ${colors.gold}`,
    background: "transparent",
    color: colors.gold,
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 600,
    fontSize: "0.8rem",
    letterSpacing: "0.03em",
    cursor: "pointer",
    position: "relative",
    zIndex: 1,
  },
  leaderboardSection: {
    maxWidth: "700px",
    margin: "0 auto 2.5rem",
    padding: "0 1.5rem",
    textAlign: "center",
  },
  trophyIcon: {
    width: "64px",
    height: "auto",
    marginBottom: "0.4rem",
    filter: "drop-shadow(0 4px 10px rgba(184,137,30,0.3))",
  },
  leaderboardList: { display: "flex", flexDirection: "column", gap: "0.6rem" },
  leaderGrid: { marginTop: "0.5rem" },
  leaderCard: {
    position: "relative",
    background: colors.card,
    border: `1px solid ${colors.gold}`,
    borderRadius: "16px",
    padding: "1rem",
    textAlign: "center",
    boxShadow: "0 4px 14px rgba(184,137,30,0.12)",
  },
  leaderCardPhotoWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1",
    borderRadius: "12px",
    overflow: "hidden",
    marginBottom: "0.6rem",
    border: `2px solid ${colors.gold}`,
  },
  leaderCardPhoto: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  leaderCardCategory: {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: "0.65rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: colors.inkDim,
    margin: "0 0 0.2rem",
  },
  leaderCardName: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    fontSize: "0.95rem",
    margin: "0 0 0.2rem",
    color: colors.ink,
  },
  leaderCardVotes: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "0.75rem",
    color: colors.gold,
    fontWeight: 700,
    margin: 0,
  },
  leaderboardRow: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: "12px",
    padding: "0.75rem 1.25rem",
    textAlign: "left",
    boxShadow: "0 2px 8px rgba(34,26,18,0.05)",
  },
  leaderboardRowFirst: { borderColor: colors.gold },
  leaderboardRank: {
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: "1rem",
    color: colors.inkDim,
    width: "2.2rem",
  },
  leaderboardName: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    fontSize: "1rem",
    flex: 1,
  },
  leaderboardCategory: { fontSize: "0.72rem", color: colors.inkDim, flex: 1 },
  leaderboardVotes: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "0.85rem",
    color: colors.gold,
    fontWeight: 700,
  },
  partnersMarquee: {
    overflow: "hidden",
    padding: "1rem 0",
    marginBottom: "2.5rem",
    borderTop: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    background: colors.card,
  },
  partnerBadge: {
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "172px",
    minWidth: "140px",
    padding: "0.75rem 1.5rem",
    marginRight: "1.25rem",
    border: `1px solid ${colors.border}`,
    borderRadius: "10px",
    background: "#FFFFFF",
    boxShadow: "0 2px 8px rgba(34,26,18,0.06)",
  },
  partnerBadgeText: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "0.8rem",
    letterSpacing: "0.05em",
    color: colors.ink,
    whiteSpace: "nowrap",
  },
  partnerLogoImg: { maxHeight: "144px", maxWidth: "110px", objectFit: "contain" },
  main: { maxWidth: "1100px", margin: "0 auto", padding: "0 1.5rem" },
  nomineesBanner: {
    display: "inline-block",
    background: colors.red,
    color: "#FFF",
    fontFamily: "'Fraunces', serif",
    fontWeight: 700,
    fontSize: "1.3rem",
    padding: "0.5rem 2rem",
    borderRadius: "8px",
    margin: "0 auto 2rem",
    textAlign: "center",
    display: "block",
    width: "fit-content",
    boxShadow: "0 4px 14px rgba(180,24,47,0.3)",
  },
  errorBanner: {
    background: "rgba(180,24,47,0.08)",
    border: `1px solid ${colors.red}`,
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    marginBottom: "1.5rem",
  },
  loadingText: { color: colors.inkDim, fontFamily: "'Space Mono', monospace", textAlign: "center" },
  loaderBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "3rem 1rem",
    gap: "1rem",
  },
  loaderSpinner: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: `3px solid ${colors.border}`,
    borderTopColor: colors.gold,
    animation: "spin 0.9s linear infinite",
  },
  loaderText: {
    fontFamily: "'Fraunces', serif",
    fontStyle: "italic",
    fontSize: "0.95rem",
    color: colors.inkDim,
    margin: 0,
    letterSpacing: "0.02em",
  },
  categorySection: { marginBottom: "3rem" },
  categoryTitle: {
    fontFamily: "'Montserrat', sans-serif",
    fontStyle: "normal",
    fontWeight: 700,
    fontSize: "1.35rem",
    letterSpacing: "0.02em",
    color: colors.gold,
    textAlign: "center",
    margin: "0 0 1.5rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "1.25rem",
  },
  card: {
    position: "relative",
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: "16px",
    padding: "1.25rem 1rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    boxShadow: "0 4px 14px rgba(34,26,18,0.06)",
  },
  candidatePhotoWrapLeader: {
    position: "relative",
    borderColor: colors.gold,
    boxShadow: "0 0 0 3px rgba(184,137,30,0.25)",
  },
  leaderBadge: {
    position: "absolute",
    top: "-18px",
    left: "-8px",
    width: "40px",
    height: "auto",
    zIndex: 3,
    filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.35))",
  },
  candidateVotes: {
    fontFamily: "'Space Mono', monospace",
    fontWeight: 400,
    fontSize: "0.75rem",
    color: colors.inkDim,
  },
  candidateName: {
    fontFamily: "'Fraunces', serif",
    fontSize: "1rem",
    fontWeight: 600,
    margin: "0 0 0.75rem",
    color: colors.ink,
  },
  voteButton: {
    width: "100%",
    padding: "0.6rem",
    borderRadius: "999px",
    border: "none",
    background: colors.red,
    color: "#FFF",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "0.85rem",
    letterSpacing: "0.03em",
  },
  footer: { maxWidth: "700px", margin: "3rem auto 0", padding: "0 1.5rem", textAlign: "center" },
  footerText: { fontSize: "0.75rem", color: colors.inkDim, lineHeight: 1.6 },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(34, 26, 18, 0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: "1.5rem",
  },
  modalCard: {
    background: colors.card,
    border: `1px solid ${colors.gold}`,
    borderRadius: "16px",
    padding: "2rem",
    maxWidth: "380px",
    width: "100%",
    textAlign: "center",
    boxShadow: "0 20px 50px rgba(34,26,18,0.25)",
  },
  modalCardWide: {
    background: colors.card,
    border: `1px solid ${colors.gold}`,
    borderRadius: "16px",
    padding: "1.5rem",
    maxWidth: "480px",
    width: "100%",
    textAlign: "center",
    boxShadow: "0 20px 50px rgba(34,26,18,0.25)",
  },
  infoModalCard: {
    position: "relative",
    background: colors.card,
    border: `1px solid ${colors.gold}`,
    borderRadius: "16px",
    padding: "2rem",
    maxWidth: "540px",
    width: "100%",
    maxHeight: "85vh",
    overflowY: "auto",
    textAlign: "left",
    boxShadow: "0 20px 50px rgba(34,26,18,0.3)",
  },
  infoCloseButton: {
    position: "absolute",
    top: "1rem",
    right: "1rem",
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    border: `1px solid ${colors.border}`,
    background: colors.bg,
    color: colors.ink,
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  infoModalLogo: {
    display: "block",
    maxWidth: "220px",
    margin: "0 auto 1.5rem",
  },
  infoSectionTitle: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 700,
    fontSize: "1.05rem",
    color: colors.gold,
    margin: "1.5rem 0 0.6rem",
  },
  infoText: {
    fontSize: "0.88rem",
    color: colors.inkDim,
    lineHeight: 1.6,
    margin: "0 0 0.75rem",
  },
  infoLinks: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.6rem",
    marginTop: "0.5rem",
  },
  infoLink: {
    padding: "0.5rem 1.1rem",
    borderRadius: "999px",
    border: `1px solid ${colors.gold}`,
    color: colors.gold,
    textDecoration: "none",
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 600,
    fontSize: "0.78rem",
  },
  threeDsFrame: {
    width: "100%",
    height: "420px",
    border: `1px solid ${colors.border}`,
    borderRadius: "10px",
    margin: "1rem 0",
  },
  modalSpinner: {
    width: "36px",
    height: "36px",
    border: `3px solid ${colors.border}`,
    borderTopColor: colors.gold,
    borderRadius: "50%",
    margin: "0 auto 1rem",
    animation: "spin 1s linear infinite",
  },
  modalTitle: {
    fontFamily: "'Fraunces', serif",
    fontSize: "1.2rem",
    margin: "0 0 0.75rem",
    color: colors.ink,
  },
  modalText: { fontSize: "0.9rem", color: colors.inkDim, lineHeight: 1.5, margin: "0 0 1rem" },
  stepperRow: { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" },
  stepperButton: {
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    border: `1px solid ${colors.border}`,
    background: colors.bg,
    color: colors.ink,
    fontSize: "1.1rem",
    fontWeight: 700,
    cursor: "pointer",
  },
  stepperInput: {
    flex: 1,
    textAlign: "center",
    padding: "0.5rem",
    borderRadius: "8px",
    border: `1px solid ${colors.border}`,
    background: "#FFFFFF",
    color: colors.ink,
    fontFamily: "'Space Mono', monospace",
    fontSize: "1rem",
  },
  totalPriceText: {
    fontSize: "0.85rem",
    color: colors.inkDim,
    margin: "0 0 1rem",
  },
  phoneLabel: { display: "block", fontSize: "0.78rem", color: colors.inkDim, marginBottom: "0.4rem" },
  phoneInput: {
    width: "100%",
    padding: "0.6rem 0.75rem",
    borderRadius: "8px",
    border: `1px solid ${colors.border}`,
    background: "#FFFFFF",
    color: colors.ink,
    fontFamily: "'Space Mono', monospace",
    fontSize: "0.95rem",
    boxSizing: "border-box",
    marginBottom: "0.75rem",
  },
  phoneError: { color: colors.red, fontSize: "0.75rem", marginTop: "0.25rem" },
  codeAchatBox: {
    background: "rgba(184,137,30,0.08)",
    border: `1px solid ${colors.gold}`,
    borderRadius: "10px",
    padding: "0.75rem",
    marginBottom: "1rem",
  },
  codeAchatLabel: { fontSize: "0.7rem", color: colors.inkDim, margin: "0 0 0.25rem" },
  codeAchatValue: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "1.4rem",
    fontWeight: 700,
    color: colors.gold,
    margin: 0,
    letterSpacing: "0.1em",
  },
  modalHint: { fontSize: "0.72rem", color: colors.inkDim, margin: 0 },
  modalCancelButton: {
    padding: "0.65rem 1rem",
    borderRadius: "10px",
    border: `1px solid ${colors.border}`,
    background: "transparent",
    color: colors.ink,
    cursor: "pointer",
    fontSize: "0.85rem",
  },
};
