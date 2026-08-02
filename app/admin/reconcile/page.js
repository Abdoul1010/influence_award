"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabasePublic } from "@/lib/supabaseClient";

export default function ReconcilePage() {
  const [token, setToken] = useState(null);
  const [mismatches, setMismatches] = useState(null);
  const [checked, setChecked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const router = useRouter();

  async function getToken() {
    const { data } = await supabasePublic.auth.getSession();
    return data?.session?.access_token || null;
  }

  async function load() {
    setLoading(true);
    setError(null);
    const t = await getToken();
    if (!t) {
      router.push("/admin/login");
      return;
    }
    setToken(t);
    const res = await fetch("/api/admin/reconcile", {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.status === 401 || res.status === 403) {
      router.push("/admin/login");
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Erreur de chargement.");
    } else {
      setMismatches(data.mismatches);
      setChecked(data.checked);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmOne(id) {
    setConfirmingId(id);
    setError(null);
    const res = await fetch("/api/admin/reconcile/confirm", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    setConfirmingId(null);
    if (!res.ok) {
      setError(data.error || "Échec de la confirmation.");
      return;
    }
    setMismatches((prev) => prev.filter((m) => m.id !== id));
  }

  async function confirmAll() {
    if (!mismatches?.length) return;
    if (!confirm(`Confirmer les ${mismatches.length} paiement(s) listé(s) ?`)) return;
    setConfirmingAll(true);
    setError(null);
    for (const m of [...mismatches]) {
      const res = await fetch("/api/admin/reconcile/confirm", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id }),
      });
      if (res.ok) {
        setMismatches((prev) => prev.filter((x) => x.id !== m.id));
      }
    }
    setConfirmingAll(false);
  }

  if (loading) return <div style={styles.page}>Vérification en cours auprès de KomiPay…</div>;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>Réconciliation des paiements</h1>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <a href="/admin" style={styles.buttonSecondary}>
            ← Statistiques
          </a>
          <button onClick={load} style={styles.buttonSecondary}>
            Rafraîchir
          </button>
        </div>
      </div>

      <p style={styles.subtitle}>
        {checked} transaction(s) "pending"/"failed" vérifiée(s) auprès de KomiPay.{" "}
        {mismatches?.length || 0} confirmée(s) côté KomiPay mais pas encore en base.
      </p>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {mismatches && mismatches.length === 0 && (
        <p style={styles.emptyText}>Rien à corriger — tout est déjà synchronisé. ✓</p>
      )}

      {mismatches && mismatches.length > 0 && (
        <>
          <button onClick={confirmAll} disabled={confirmingAll} style={styles.confirmAllButton}>
            {confirmingAll ? "Confirmation en cours…" : `Tout confirmer (${mismatches.length})`}
          </button>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Candidat</th>
                <th style={styles.th}>Téléphone</th>
                <th style={styles.th}>Voix</th>
                <th style={styles.th}>Montant</th>
                <th style={styles.th}>Moyen</th>
                <th style={styles.th}>Statut en base</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {mismatches.map((m) => (
                <tr key={m.id}>
                  <td style={styles.td}>{m.candidateName}</td>
                  <td style={styles.td}>{m.phone}</td>
                  <td style={styles.td}>{m.voteCount}</td>
                  <td style={styles.td}>{m.amount.toLocaleString()} FCFA</td>
                  <td style={styles.td}>{m.provider}</td>
                  <td style={styles.td}>
                    <span
                      style={{
                        color: m.dbStatus === "failed" ? "#C1502E" : "#E8B84B",
                        fontWeight: 700,
                      }}
                    >
                      {m.dbStatus}
                    </span>
                  </td>
                  <td style={styles.td}>{new Date(m.createdAt).toLocaleString()}</td>
                  <td style={styles.td}>
                    <button
                      onClick={() => confirmOne(m.id)}
                      disabled={confirmingId === m.id}
                      style={styles.button}
                    >
                      {confirmingId === m.id ? "…" : "Confirmer"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
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
    marginBottom: "1rem",
    flexWrap: "wrap",
    gap: "1rem",
  },
  title: { fontSize: "1.4rem", margin: 0 },
  subtitle: { fontSize: "0.85rem", color: "#C9C4B6", marginBottom: "1.5rem" },
  errorBanner: {
    background: "rgba(193,80,46,0.2)",
    border: "1px solid #C1502E",
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    marginBottom: "1.5rem",
  },
  emptyText: { color: "#C9C4B6", fontSize: "0.9rem" },
  button: {
    padding: "0.4rem 0.9rem",
    borderRadius: "8px",
    border: "none",
    background: "#E8B84B",
    color: "#14131F",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "0.78rem",
  },
  confirmAllButton: {
    padding: "0.6rem 1.2rem",
    borderRadius: "8px",
    border: "none",
    background: "#C1502E",
    color: "#F5EFE3",
    fontWeight: 700,
    cursor: "pointer",
    marginBottom: "1.25rem",
  },
  buttonSecondary: {
    padding: "0.5rem 1rem",
    borderRadius: "8px",
    border: "1px solid #C9C4B6",
    background: "transparent",
    color: "#F5EFE3",
    cursor: "pointer",
    textDecoration: "none",
    fontSize: "0.85rem",
    display: "inline-flex",
    alignItems: "center",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    borderBottom: "1px solid #26264A",
    padding: "0.5rem",
    fontSize: "0.75rem",
    color: "#C9C4B6",
  },
  td: { padding: "0.5rem", borderBottom: "1px solid #26264A", fontSize: "0.82rem" },
};
