export default function Merci() {
  return (
    <div style={styles.page}>
      <style>{`
        @keyframes fallConfetti {
          0% { transform: translateY(0) rotate(0deg); opacity: 0.9; }
          100% { transform: translateY(110vh) rotate(340deg); opacity: 0.6; }
        }
      `}</style>

      <div style={styles.confettiLayer} aria-hidden="true">
        {Array.from({ length: 14 }).map((_, i) => (
          <img
            key={i}
            src="/images/gold-confetti.png"
            alt=""
            style={{
              ...styles.confettiPiece,
              left: `${(i * 7) % 100}%`,
              animationDelay: `${(i % 7) * 0.6}s`,
              animationDuration: `${5 + (i % 5)}s`,
            }}
          />
        ))}

        {Array.from({ length: 8 }).map((_, i) => (
          <img
            key={`streamer-${i}`}
            src="/images/gold-ribbon.png"
            alt=""
            className="streamer"
            style={{
              left: `${8 + i * 12}%`,
              "--drift": `${i % 2 === 0 ? 30 : -30}px`,
              animationDelay: `${(i % 4) * 0.5}s`,
              animationDuration: `${3.5 + (i % 3)}s`,
            }}
          />
        ))}
      </div>

      <img src="/images/gold-trophy.png" alt="" style={styles.trophy} />
      <img src="/images/gold-ribbon.png" alt="" style={styles.ribbon} />

      <h1 style={styles.title}>Merci pour votre vote !</h1>
      <p style={styles.text}>
        Votre paiement est en cours de traitement. Le vote est compté dès que
        la confirmation nous parvient — généralement en quelques secondes.
      </p>
      <a href="/" style={styles.link}>
        Retour au vote
      </a>
    </div>
  );
}

const styles = {
  page: {
    position: "relative",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(180deg, rgba(20,19,31,0.92) 0%, rgba(27,27,58,0.85) 55%, rgba(20,19,31,0.95) 100%), url(/images/red-stage-curtain.jpg)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    color: "#F5EFE3",
    fontFamily: "sans-serif",
    textAlign: "center",
    padding: "2rem",
    overflow: "hidden",
  },
  confettiLayer: {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
  },
  confettiPiece: {
    position: "absolute",
    top: "-10%",
    width: "36px",
    animationName: "fallConfetti",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    opacity: 0.9,
  },
  trophy: {
    width: "90px",
    marginBottom: "0.5rem",
    filter: "drop-shadow(0 6px 16px rgba(232,184,75,0.5))",
    position: "relative",
  },
  ribbon: {
    width: "60px",
    position: "absolute",
    top: "8%",
    right: "12%",
    opacity: 0.8,
  },
  title: { fontSize: "1.8rem", marginBottom: "1rem", position: "relative" },
  text: {
    color: "#C9C4B6",
    maxWidth: "420px",
    lineHeight: 1.6,
    marginBottom: "2rem",
    position: "relative",
  },
  link: { color: "#E8B84B", fontWeight: 700, textDecoration: "none", position: "relative" },
};
