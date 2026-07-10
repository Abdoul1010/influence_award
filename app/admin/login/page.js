"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabasePublic } from "@/lib/supabaseClient";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabasePublic.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      setError("Identifiants incorrects.");
      return;
    }
    router.push("/admin");
  }

  return (
    <div style={styles.page}>
      <form onSubmit={handleLogin} style={styles.card}>
        <h1 style={styles.title}>Espace organisateur</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
          required
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          required
        />
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(180deg, rgba(20,19,31,0.9) 0%, rgba(27,27,58,0.85) 100%), url(/images/red-spotlight-stage.jpg)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    fontFamily: "sans-serif",
  },
  card: {
    background: "#1B1B3A",
    padding: "2rem",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    width: "320px",
  },
  title: { color: "#F5EFE3", fontSize: "1.2rem", margin: 0 },
  input: {
    padding: "0.7rem",
    borderRadius: "8px",
    border: "1px solid #26264A",
    background: "#14131F",
    color: "#F5EFE3",
  },
  button: {
    padding: "0.7rem",
    borderRadius: "8px",
    border: "none",
    background: "#E8B84B",
    color: "#14131F",
    fontWeight: 700,
    cursor: "pointer",
  },
  error: { color: "#C1502E", fontSize: "0.85rem", margin: 0 },
};
