"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabasePublic } from "@/lib/supabaseClient";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabasePublic.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        router.push("/admin/login");
        return;
      }
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur de chargement.");
      } else {
        setStats(data);
      }
      setLoading(false);
    }
    load();
  }, [router]);

  function exportCsv() {
    if (!stats) return;
    const rows = [
      ["Candidat", "Catégorie", "Votes confirmés", "Revenu (FCFA)"],
      ...stats.counts.map((c) => [c.name, c.category_id, c.votes, c.revenue_fcfa]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "influence-award-resultats.csv";
    a.click();
  }

  async function handleLogout() {
    await supabasePublic.auth.signOut();
    router.push("/admin/login");
  }

  if (loading) return <div style={styles.page}>Chargement…</div>;
  if (error) return <div style={styles.page}>{error}</div>;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>Tableau de bord — INFLUENCE AWARD</h1>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <a href="/admin/manage" style={{ ...styles.buttonSecondary, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            Gérer catégories & candidats
          </a>
          <button onClick={exportCsv} style={styles.button}>
            Exporter en CSV
          </button>
          <button onClick={handleLogout} style={styles.buttonSecondary}>
            Déconnexion
          </button>
        </div>
      </div>

      <div style={styles.summaryRow}>
        <div style={styles.summaryCard}>
          <p style={styles.summaryLabel}>Votes confirmés</p>
          <p style={styles.summaryValue}>{stats.totalVotes}</p>
        </div>
        <div style={styles.summaryCard}>
          <p style={styles.summaryLabel}>Revenu total</p>
          <p style={styles.summaryValue}>{stats.totalRevenue.toLocaleString()} FCFA</p>
        </div>
      </div>

      <h2 style={styles.subtitle}>Résultats par candidat</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Candidat</th>
            <th style={styles.th}>Catégorie</th>
            <th style={styles.th}>Votes</th>
            <th style={styles.th}>Revenu</th>
          </tr>
        </thead>
        <tbody>
          {stats.counts
            .sort((a, b) => b.votes - a.votes)
            .map((c) => (
              <tr key={c.candidate_id}>
                <td style={styles.td}>{c.name}</td>
                <td style={styles.td}>{c.category_id}</td>
                <td style={styles.td}>{c.votes}</td>
                <td style={styles.td}>{c.revenue_fcfa.toLocaleString()} FCFA</td>
              </tr>
            ))}
        </tbody>
      </table>

      <h2 style={styles.subtitle}>Transactions récentes</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Date</th>
            <th style={styles.th}>Catégorie</th>
            <th style={styles.th}>Téléphone</th>
            <th style={styles.th}>Statut</th>
          </tr>
        </thead>
        <tbody>
          {stats.recentVotes.map((v) => (
            <tr key={v.id}>
              <td style={styles.td}>{new Date(v.created_at).toLocaleString()}</td>
              <td style={styles.td}>{v.category_id}</td>
              <td style={styles.td}>{v.phone_number}</td>
              <td style={styles.td}>{v.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#14131F",
    color: "#F5EFE3",
    fontFamily: "sans-serif",
    padding: "2rem",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2rem",
    flexWrap: "wrap",
    gap: "1rem",
  },
  title: { fontSize: "1.4rem", margin: 0 },
  button: {
    padding: "0.6rem 1rem",
    borderRadius: "8px",
    border: "none",
    background: "#E8B84B",
    color: "#14131F",
    fontWeight: 700,
    cursor: "pointer",
  },
  buttonSecondary: {
    padding: "0.6rem 1rem",
    borderRadius: "8px",
    border: "1px solid #C9C4B6",
    background: "transparent",
    color: "#F5EFE3",
    cursor: "pointer",
  },
  summaryRow: { display: "flex", gap: "1rem", marginBottom: "2rem" },
  summaryCard: {
    background: "#1B1B3A",
    border: "1px solid #26264A",
    borderRadius: "12px",
    padding: "1rem 1.5rem",
  },
  summaryLabel: { fontSize: "0.8rem", color: "#C9C4B6", margin: 0 },
  summaryValue: { fontSize: "1.6rem", fontWeight: 700, margin: "0.25rem 0 0", color: "#E8B84B" },
  subtitle: { fontSize: "1.1rem", marginTop: "2rem", marginBottom: "1rem" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    borderBottom: "1px solid #26264A",
    padding: "0.5rem",
    fontSize: "0.8rem",
    color: "#C9C4B6",
  },
  td: { padding: "0.5rem", borderBottom: "1px solid #26264A", fontSize: "0.85rem" },
};
