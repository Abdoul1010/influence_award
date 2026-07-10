"use client";

import { useState, useEffect } from "react";
import { supabasePublic } from "@/lib/supabaseClient";

function normalizePhone(raw) {
  let digits = raw.replace(/[\s.-]/g, "");
  if (digits.startsWith("+227")) digits = digits.slice(4);
  else if (digits.startsWith("227")) digits = digits.slice(3);
  return digits;
}
function isValidPhone(raw) {
  return /^\d{8}$/.test(normalizePhone(raw));
}

export default function VotePage() {
  const PETAL_COLORS = ["#E8B84B", "#C1502E", "#F5EFE3", "#D98C4A"];
  const petals = Array.from({ length: 18 }).map((_, i) => ({
    left: (i * 5.6) % 100,
    delay: (i % 9) * 1.3,
    duration: 9 + (i % 6) * 1.8,
    color: PETAL_COLORS[i % PETAL_COLORS.length],
  }));

  const [categories, setCategories] = useState([]);
  const [candidatesByCategory, setCandidatesByCategory] = useState({});
  const [activeCategory, setActiveCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState(null);
  const [submittingId, setSubmittingId] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [partners, setPartners] = useState([]);
  const [provider, setProvider] = useState("nita_transfert");
  const [pendingPayment, setPendingPayment] = useState(null); // { candidateId, transactionRef, codeAchat, provider }
  const [pendingStatus, setPendingStatus] = useState(null); // null | "pending" | "confirmed" | "failed"
  const [voteModalCandidate, setVoteModalCandidate] = useState(null); // candidat en cours de vote (avant paiement)

  const PROVIDERS = [
    { code: "nita_transfert", label: "NITA" },
    { code: "amana_transfert", label: "Amana" },
    { code: "airtel_money", label: "Airtel Money" },
    { code: "moov_flooz", label: "Moov Flooz" },
    { code: "zamani_cash", label: "Zamani Cash" },
  ];

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
      setActiveCategory(cats[0]?.id || null);
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
        .order("votes", { ascending: false })
        .limit(5);
      if (!error && data) setLeaderboard(data);
    }
    loadLeaderboard();
    const interval = setInterval(loadLeaderboard, 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleVote(candidateId) {
    setPhoneError(null);
    if (!isValidPhone(phone)) {
      setPhoneError("Entrez un numéro valide (8 chiffres, ex : 90 12 34 56).");
      return;
    }
    setSubmittingId(candidateId);
    setError(null);
    try {
      const res = await fetch("/api/votes/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: activeCategory,
          candidateId,
          phone,
          provider,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhoneError(data.error || "Le vote a échoué.");
        return;
      }

      if (!data.pending) {
        // Opérateur mobile money : confirmation immédiate.
        window.location.href = "/vote/merci";
        return;
      }

      // STA (NITA/Amana) : le votant doit confirmer dans son application.
      setVoteModalCandidate(null);
      setPendingPayment({
        candidateId,
        transactionRef: data.transactionRef,
        codeAchat: data.codeAchat,
        message: data.message,
        provider,
      });
      setPendingStatus("pending");
    } catch (e) {
      setError("Connexion impossible. Réessayez.");
    } finally {
      setSubmittingId(null);
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
        // sinon on reste en "pending", le prochain intervalle rappellera
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

  const activeCandidates = candidatesByCategory[activeCategory] || [];

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
        
        {/*<div className="hero-rays" />
        <img src="/images/red-curtain-corner.png" alt="" style={styles.curtainLeft} />
        <img
          src="/images/red-curtain-corner.png"
          alt=""
          style={styles.curtainRight}
        />
        <img src="/images/gold-firework.png" alt="" style={styles.fireworkBg} />*/}
        
        {/*<div style={styles.heroGlow} className="hero-pulse" />*/}
        <p style={styles.eyebrow}>Région de Dosso · Soirée de gala</p>
        <h1 style={styles.heroTitle}>
          INFLUENCE <span style={styles.heroTitleAccent}>AWARD</span>
        </h1>
        <p style={styles.heroSubtitle}>
          Votez pour les jeunes talents qui inspirent la jeunesse d'aujourd'hui
          et de demain.
        </p>
      </header>

      {/* <img src="/images/red-silk-wave.png" alt="" style={styles.silkDivider} /> */}

      {/* CLASSEMENT EN DIRECT */}
      {leaderboard.length > 0 && (
        <section style={styles.leaderboardSection}>
          <img src="/images/gold-trophy.png" alt="" style={styles.trophyIcon} />
          <p style={styles.eyebrow}>En ce moment</p>
          {/*<h2 style={styles.leaderboardTitle}>Classement en direct</h2>*/}
          <div style={styles.leaderboardList}>
            {leaderboard.map((c, i) => (
              <div
                key={c.candidate_id}
                style={{
                  ...styles.leaderboardRow,
                  ...(i === 0 ? styles.leaderboardRowFirst : {}),
                }}
                className={i === 0 ? "leaderboard-first" : ""}
              >
                <span
                  style={{
                    ...styles.leaderboardRank,
                    ...(i === 0
                      ? { color: "#E8B84B" }
                      : i === 1
                      ? { color: "#C9C4B6" }
                      : i === 2
                      ? { color: "#C1502E" }
                      : {}),
                  }}
                >
                  #{i + 1}
                </span>
                <span style={styles.leaderboardName}>{c.name}</span>
                <span style={styles.leaderboardCategory}>
                  {categories.find((cat) => cat.id === c.category_id)?.label || ""}
                </span>
                <span style={styles.leaderboardVotes}>
                  {c.votes} vote{c.votes !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && (
        <nav style={styles.tabBar}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                ...styles.tab,
                ...(cat.id === activeCategory ? styles.tabActive : {}),
              }}
            >
              <span style={styles.tabTag}>{cat.tag}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </nav>
      )}

      <main style={styles.main}>
        {error && <div style={styles.errorBanner}>{error}</div>}

        {loading ? (
          <p style={styles.loadingText}>Chargement…</p>
        ) : (
          <>
            <div style={styles.grid}>
              {activeCandidates.map((c) => (
                <div key={c.id} style={styles.card} className="candidate-card">
                  <div className="candidate-photo-wrap">
                    <img
                      src={
                        c.photo_url ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          c.name
                        )}&background=E8B84B&color=14131F&size=256`
                      }
                      alt={c.name}
                    />
                  </div>
                  <h3 style={styles.candidateName}>{c.name}</h3>
                  {/*<p style={styles.candidateBio}>{c.bio}</p>*/}
                  <button
                    onClick={() => {
                      setVoteModalCandidate(c);
                      setPhoneError(null);
                    }}
                    style={styles.voteButton}
                  >
                    Voter
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

      </main>
      <br/><br/>


        {/* PARTENAIRES — défilement horizontal */}
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
          Dévéloppé par Rahma Group Code &#169; Tous droit réservé
        </p>
      </footer>

      {voteModalCandidate && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={styles.modalTitle}>Voter pour {voteModalCandidate.name}</h3>
            <p style={styles.modalText}>Vote à 100 FCFA.</p>

            <div style={{ textAlign: "left", marginBottom: "1rem" }}>
              <label style={styles.phoneLabel} htmlFor="modal-phone-input">
                Numéro de téléphone pour paiement
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

              <label style={{ ...styles.phoneLabel, marginTop: "0.75rem" }} htmlFor="modal-provider-select">
                Moyen de paiement
              </label>
              <select
                id="modal-provider-select"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                style={styles.phoneInput}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>

              {phoneError && <p style={styles.phoneError}>{phoneError}</p>}
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                style={{ ...styles.voteButton, flex: 1 }}
                onClick={() => handleVote(voteModalCandidate.id)}
                disabled={submittingId === voteModalCandidate.id}
              >
                {submittingId === voteModalCandidate.id ? "Envoi…" : "Confirmer le vote"}
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
          <div style={styles.modalCard}>
            {pendingStatus === "pending" && (
              <>
                <div style={styles.modalSpinner} />
                <h3 style={styles.modalTitle}>Confirmez votre paiement</h3>
                <p style={styles.modalText}>
                  Ouvrez votre application{" "}
                  <strong>
                    {PROVIDERS.find((p) => p.code === pendingPayment.provider)?.label}
                  </strong>{" "}
                  et validez la transaction de 100 FCFA.
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

const colors = {
  night: "#14131F",
  indigo: "#1B1B3A",
  indigoLight: "#26264A",
  gold: "#E8B84B",
  terracotta: "#C1502E",
  cream: "#F5EFE3",
  creamDim: "#C9C4B6",
};

const styles = {
  page: {
    position: "relative",
    zIndex: 0,
    minHeight: "100vh",
    background: `linear-gradient(180deg, ${colors.night} 0%, ${colors.indigo} 40%, ${colors.night} 100%)`,
    color: colors.cream,
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
    padding: "1rem 1.5rem 3rem",
    overflow: "hidden",
  },
  heroGlow: {
    position: "absolute",
    top: "-40%",
    left: "50%",
    marginLeft: "-350px",
    width: "700px",
    height: "700px",
    background: `radial-gradient(circle, ${colors.gold}33 0%, transparent 65%)`,
    pointerEvents: "none",
  },
  curtainLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "180px",
    height: "auto",
    maxHeight: "70%",
    opacity: 0.75,
    pointerEvents: "none",
  },
  curtainRight: {
    position: "absolute",
    top: 0,
    right: 0,
    width: "180px",
    height: "auto",
    maxHeight: "70%",
    opacity: 0.75,
    transform: "scaleX(-1)",
    pointerEvents: "none",
  },
  fireworkBg: {
    float: "right",
    position: "absolute",
    top: "50%",
    left: "75%",
    width: "60px",
    maxWidth: "90%",
    transform: "translate(-50%, -55%)",
    opacity: 0.18,
    pointerEvents: "none",
    mixBlendMode: "screen",
  },
  eyebrow: {
    fontFamily: "'Space Mono', monospace",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontSize: "0.75rem",
    color: colors.gold,
    marginBottom: "0.75rem",
    position: "relative",
  },
  heroTitle: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 700,
    fontSize: "clamp(2.5rem, 7vw, 4.5rem)",
    margin: 0,
    position: "relative",
  },
  heroTitleAccent: { color: colors.gold, fontStyle: "italic", fontWeight: 500 },
  heroSubtitle: {
    maxWidth: "480px",
    margin: "1rem auto 0",
    color: colors.creamDim,
    lineHeight: 1.5,
    position: "relative",
  },
  tabBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.6rem",
    justifyContent: "center",
    padding: "0 1.5rem",
    marginBottom: "2.5rem",
  },
  silkDivider: {
    display: "block",
    width: "260px",
    maxWidth: "60%",
    margin: "-1.5rem auto 1rem",
    opacity: 0.85,
    position: "relative",
    zIndex: 1,
  },
  partnersMarquee: {
    overflow: "hidden",
    padding: "1rem 0",
    marginBottom: "3rem",
    borderTop: `1px solid ${colors.indigoLight}`,
    borderBottom: `1px solid ${colors.indigoLight}`,
    background: "rgba(255,255,255,0.02)",
  },
  partnerBadge: {
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.6rem 1.75rem",
    marginRight: "1.5rem",
    border: `1px solid ${colors.indigoLight}`,
    borderRadius: "10px",
    background: "rgba(255,255,255,0.03)",
  },
  partnerBadgeText: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "0.8rem",
    letterSpacing: "0.05em",
    color: colors.creamDim,
    whiteSpace: "nowrap",
  },
  partnerLogoImg: { height: "100px", objectFit: "contain" },
  leaderboardSection: {
    maxWidth: "700px",
    margin: "0 auto 3.5rem",
    padding: "0 1.5rem",
    textAlign: "center",
  },
  trophyIcon: {
    width: "72px",
    height: "auto",
    marginBottom: "0.5rem",
    filter: "drop-shadow(0 4px 12px rgba(232,184,75,0.4))",
  },
  leaderboardTitle: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    fontSize: "1.6rem",
    margin: "0 0 1.5rem",
  },
  leaderboardList: { display: "flex", flexDirection: "column", gap: "0.6rem" },
  leaderboardRow: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${colors.indigoLight}`,
    borderRadius: "12px",
    padding: "0.75rem 1.25rem",
    textAlign: "left",
  },
  leaderboardRowFirst: { borderColor: colors.gold },
  leaderboardRank: {
    fontFamily: "'Space Mono', monospace",
    fontWeight: 700,
    fontSize: "1rem",
    color: colors.creamDim,
    width: "2.2rem",
  },
  leaderboardName: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    fontSize: "1rem",
    flex: 1,
  },
  leaderboardCategory: {
    fontSize: "0.72rem",
    color: colors.creamDim,
    flex: 1,
  },
  leaderboardVotes: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "0.85rem",
    color: colors.gold,
    fontWeight: 700,
  },
  leaderboardNote: {
    fontSize: "0.7rem",
    color: colors.creamDim,
    marginTop: "1rem",
  },
  tab: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "0.15rem",
    padding: "0.55rem 1rem",
    borderRadius: "10px",
    border: `1px solid ${colors.indigoLight}`,
    background: "rgba(255,255,255,0.03)",
    color: colors.creamDim,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.85rem",
  },
  tabActive: { background: colors.gold, borderColor: colors.gold, color: colors.night },
  tabTag: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "0.62rem",
    textTransform: "uppercase",
    opacity: 0.7,
  },
  main: { maxWidth: "1100px", margin: "0 auto", padding: "0 1.5rem" },
  errorBanner: {
    background: "rgba(193,80,46,0.2)",
    border: `1px solid ${colors.terracotta}`,
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    marginBottom: "1.5rem",
  },
  loadingText: { color: colors.creamDim, fontFamily: "'Space Mono', monospace" },
  phoneRow: {
    marginBottom: "1.5rem",
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${colors.indigoLight}`,
    borderRadius: "12px",
    padding: "1rem 1.25rem",
    maxWidth: "360px",
  },
  phoneLabel: { display: "block", fontSize: "0.78rem", color: colors.creamDim, marginBottom: "0.5rem" },
  phoneInput: {
    width: "100%",
    padding: "0.6rem 0.75rem",
    borderRadius: "8px",
    border: `1px solid ${colors.indigoLight}`,
    background: colors.night,
    color: colors.cream,
    fontFamily: "'Space Mono', monospace",
    boxSizing: "border-box",
  },
  phoneError: { color: colors.terracotta, fontSize: "0.75rem", marginTop: "0.5rem" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "1.25rem",
  },
  card: {
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${colors.indigoLight}`,
    borderRadius: "16px",
    padding: "1.5rem 1.25rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
  avatar: {
    width: "88px",
    height: "88px",
    borderRadius: "50%",
    marginBottom: "0.9rem",
    border: `2px solid ${colors.indigoLight}`,
    objectFit: "cover",
  },
  candidateName: { fontFamily: "'Fraunces', serif", fontSize: "1.1rem", fontWeight: 600, margin: "0 0 0.25rem" },
  candidateBio: { fontSize: "0.78rem", color: colors.creamDim, margin: "0 0 1rem" },
  voteButton: {
    width: "100%",
    padding: "0.65rem",
    borderRadius: "10px",
    border: "none",
    background: colors.gold,
    color: colors.night,
    fontWeight: 700,
    cursor: "pointer",
  },
  footer: { maxWidth: "700px", margin: "4rem auto 0", padding: "0 1.5rem", textAlign: "center" },
  footerText: { fontSize: "0.75rem", color: colors.creamDim, lineHeight: 1.6 },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10, 9, 18, 0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: "1.5rem",
  },
  modalCard: {
    background: colors.indigo,
    border: `1px solid ${colors.gold}`,
    borderRadius: "16px",
    padding: "2rem",
    maxWidth: "380px",
    width: "100%",
    textAlign: "center",
  },
  modalSpinner: {
    width: "36px",
    height: "36px",
    border: `3px solid ${colors.indigoLight}`,
    borderTopColor: colors.gold,
    borderRadius: "50%",
    margin: "0 auto 1rem",
    animation: "spin 1s linear infinite",
  },
  modalTitle: {
    fontFamily: "'Fraunces', serif",
    fontSize: "1.2rem",
    margin: "0 0 0.75rem",
  },
  modalText: { fontSize: "0.9rem", color: colors.creamDim, lineHeight: 1.5, margin: "0 0 1rem" },
  codeAchatBox: {
    background: "rgba(232, 184, 75, 0.1)",
    border: `1px solid ${colors.gold}`,
    borderRadius: "10px",
    padding: "0.75rem",
    marginBottom: "1rem",
  },
  codeAchatLabel: { fontSize: "0.7rem", color: colors.creamDim, margin: "0 0 0.25rem" },
  codeAchatValue: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "1.4rem",
    fontWeight: 700,
    color: colors.gold,
    margin: 0,
    letterSpacing: "0.1em",
  },
  modalHint: { fontSize: "0.72rem", color: colors.creamDim, margin: 0 },
  modalCancelButton: {
    padding: "0.65rem 1rem",
    borderRadius: "10px",
    border: `1px solid ${colors.creamDim}`,
    background: "transparent",
    color: colors.cream,
    cursor: "pointer",
    fontSize: "0.85rem",
  },
};
