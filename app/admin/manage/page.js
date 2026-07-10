"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabasePublic } from "@/lib/supabaseClient";

export default function ManagePage() {
  const [token, setToken] = useState(null);
  const [categories, setCategories] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();

  // Formulaire catégorie
  const [catLabel, setCatLabel] = useState("");
  const [catTag, setCatTag] = useState("");
  const [editingCatId, setEditingCatId] = useState(null);

  // Formulaire candidat
  const [candCategoryId, setCandCategoryId] = useState("");
  const [candName, setCandName] = useState("");
  const [candBio, setCandBio] = useState("");
  const [candPhotoFile, setCandPhotoFile] = useState(null);
  const [editingCandId, setEditingCandId] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Formulaire partenaire
  const [partnerName, setPartnerName] = useState("");
  const [partnerLogoFile, setPartnerLogoFile] = useState(null);
  const [editingPartnerId, setEditingPartnerId] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  async function getToken() {
    const { data } = await supabasePublic.auth.getSession();
    return data?.session?.access_token || null;
  }

  async function loadAll() {
    const t = await getToken();
    if (!t) {
      router.push("/admin/login");
      return;
    }
    setToken(t);
    const headers = { Authorization: `Bearer ${t}` };
    const [catRes, candRes, partnerRes] = await Promise.all([
      fetch("/api/admin/categories", { headers }),
      fetch("/api/admin/candidates", { headers }),
      fetch("/api/admin/partners", { headers }),
    ]);
    if (catRes.status === 401 || catRes.status === 403) {
      router.push("/admin/login");
      return;
    }
    const catData = await catRes.json();
    const candData = await candRes.json();
    const partnerData = await partnerRes.json();
    if (!catRes.ok || !candRes.ok || !partnerRes.ok) {
      setError(catData.error || candData.error || partnerData.error || "Erreur de chargement.");
    } else {
      setCategories(catData.categories);
      setCandidates(candData.candidates);
      setPartners(partnerData.partners);
      if (!candCategoryId && catData.categories[0]) {
        setCandCategoryId(catData.categories[0].id);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function authHeaders(extra = {}) {
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  // ---- Catégories -----------------------------------------------------
  async function submitCategory(e) {
    e.preventDefault();
    setError(null);
    const payload = { label: catLabel, tag: catTag };
    const res = editingCatId
      ? await fetch(`/api/admin/categories/${editingCatId}`, {
          method: "PATCH",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        })
      : await fetch("/api/admin/categories", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setCatLabel("");
    setCatTag("");
    setEditingCatId(null);
    loadAll();
  }

  function startEditCategory(cat) {
    setEditingCatId(cat.id);
    setCatLabel(cat.label);
    setCatTag(cat.tag || "");
  }

  async function deleteCategory(id) {
    if (!confirm("Supprimer cette catégorie et tous ses candidats ?")) return;
    setError(null);
    const res = await fetch(`/api/admin/categories/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    loadAll();
  }

  // ---- Candidats --------------------------------------------------------
  async function submitCandidate(e) {
    e.preventDefault();
    setError(null);

    let photoUrl;
    if (candPhotoFile) {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", candPhotoFile);
      const upRes = await fetch("/api/admin/upload-photo", {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      const upData = await upRes.json();
      setUploading(false);
      if (!upRes.ok) {
        setError(upData.error);
        return;
      }
      photoUrl = upData.url;
    }

    const payload = {
      category_id: candCategoryId,
      name: candName,
      bio: candBio,
      ...(photoUrl ? { photo_url: photoUrl } : {}),
    };

    const res = editingCandId
      ? await fetch(`/api/admin/candidates/${editingCandId}`, {
          method: "PATCH",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        })
      : await fetch("/api/admin/candidates", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setCandName("");
    setCandBio("");
    setCandPhotoFile(null);
    setEditingCandId(null);
    loadAll();
  }

  function startEditCandidate(cand) {
    setEditingCandId(cand.id);
    setCandCategoryId(cand.category_id);
    setCandName(cand.name);
    setCandBio(cand.bio || "");
    setCandPhotoFile(null);
  }

  async function deleteCandidate(id) {
    if (!confirm("Supprimer ce candidat ?")) return;
    setError(null);
    const res = await fetch(`/api/admin/candidates/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    loadAll();
  }

  // ---- Partenaires -------------------------------------------------------
  async function submitPartner(e) {
    e.preventDefault();
    setError(null);

    let logoUrl;
    if (partnerLogoFile) {
      setUploadingLogo(true);
      const fd = new FormData();
      fd.append("file", partnerLogoFile);
      const upRes = await fetch("/api/admin/upload-logo", {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      const upData = await upRes.json();
      setUploadingLogo(false);
      if (!upRes.ok) {
        setError(upData.error);
        return;
      }
      logoUrl = upData.url;
    }

    const payload = {
      name: partnerName,
      ...(logoUrl ? { logo_url: logoUrl } : {}),
    };

    const res = editingPartnerId
      ? await fetch(`/api/admin/partners/${editingPartnerId}`, {
          method: "PATCH",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        })
      : await fetch("/api/admin/partners", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setPartnerName("");
    setPartnerLogoFile(null);
    setEditingPartnerId(null);
    loadAll();
  }

  function startEditPartner(p) {
    setEditingPartnerId(p.id);
    setPartnerName(p.name);
    setPartnerLogoFile(null);
  }

  async function deletePartner(id) {
    if (!confirm("Supprimer ce partenaire ?")) return;
    setError(null);
    const res = await fetch(`/api/admin/partners/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    loadAll();
  }

  if (loading) return <div style={styles.page}>Chargement…</div>;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>Gestion — INFLUENCE AWARD</h1>
        <a href="/admin" style={styles.link}>
          ← Voir les statistiques
        </a>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {/* CATÉGORIES */}
      <section style={styles.section}>
        <h2 style={styles.subtitle}>Catégories</h2>
        <form onSubmit={submitCategory} style={styles.form}>
          <input
            placeholder="Nom de la catégorie"
            value={catLabel}
            onChange={(e) => setCatLabel(e.target.value)}
            style={styles.input}
            required
          />
          <input
            placeholder="Étiquette (ex: Digital)"
            value={catTag}
            onChange={(e) => setCatTag(e.target.value)}
            style={styles.input}
          />
          <button type="submit" style={styles.button}>
            {editingCatId ? "Enregistrer" : "Ajouter"}
          </button>
          {editingCatId && (
            <button
              type="button"
              style={styles.buttonSecondary}
              onClick={() => {
                setEditingCatId(null);
                setCatLabel("");
                setCatTag("");
              }}
            >
              Annuler
            </button>
          )}
        </form>

        <ul style={styles.list}>
          {categories.map((c) => (
            <li key={c.id} style={styles.listItem}>
              <span>
                <strong>{c.label}</strong>{" "}
                {c.tag && <span style={styles.tagBadge}>{c.tag}</span>}
              </span>
              <span style={styles.itemActions}>
                <button style={styles.smallButton} onClick={() => startEditCategory(c)}>
                  Modifier
                </button>
                <button style={styles.smallButtonDanger} onClick={() => deleteCategory(c.id)}>
                  Supprimer
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* CANDIDATS */}
      <section style={styles.section}>
        <h2 style={styles.subtitle}>Candidats</h2>
        <form onSubmit={submitCandidate} style={styles.form}>
          <select
            value={candCategoryId}
            onChange={(e) => setCandCategoryId(e.target.value)}
            style={styles.input}
            required
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            placeholder="Nom du candidat"
            value={candName}
            onChange={(e) => setCandName(e.target.value)}
            style={styles.input}
            required
          />
          <input
            placeholder="Courte bio"
            value={candBio}
            onChange={(e) => setCandBio(e.target.value)}
            style={styles.input}
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setCandPhotoFile(e.target.files?.[0] || null)}
            style={styles.input}
          />
          <button type="submit" style={styles.button} disabled={uploading}>
            {uploading ? "Envoi photo…" : editingCandId ? "Enregistrer" : "Ajouter"}
          </button>
          {editingCandId && (
            <button
              type="button"
              style={styles.buttonSecondary}
              onClick={() => {
                setEditingCandId(null);
                setCandName("");
                setCandBio("");
                setCandPhotoFile(null);
              }}
            >
              Annuler
            </button>
          )}
        </form>

        <ul style={styles.list}>
          {candidates.map((c) => (
            <li key={c.id} style={styles.listItem}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                {c.photo_url && (
                  <img src={c.photo_url} alt={c.name} style={styles.thumb} />
                )}
                <span>
                  <strong>{c.name}</strong>
                  <br />
                  <span style={styles.itemMeta}>
                    {categories.find((cat) => cat.id === c.category_id)?.label || c.category_id}
                  </span>
                </span>
              </span>
              <span style={styles.itemActions}>
                <button style={styles.smallButton} onClick={() => startEditCandidate(c)}>
                  Modifier
                </button>
                <button style={styles.smallButtonDanger} onClick={() => deleteCandidate(c.id)}>
                  Supprimer
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* PARTENAIRES */}
      <section style={styles.section}>
        <h2 style={styles.subtitle}>Partenaires (défilement du site)</h2>
        <form onSubmit={submitPartner} style={styles.form}>
          <input
            placeholder="Nom du partenaire"
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            style={styles.input}
            required
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPartnerLogoFile(e.target.files?.[0] || null)}
            style={styles.input}
          />
          <button type="submit" style={styles.button} disabled={uploadingLogo}>
            {uploadingLogo ? "Envoi logo…" : editingPartnerId ? "Enregistrer" : "Ajouter"}
          </button>
          {editingPartnerId && (
            <button
              type="button"
              style={styles.buttonSecondary}
              onClick={() => {
                setEditingPartnerId(null);
                setPartnerName("");
                setPartnerLogoFile(null);
              }}
            >
              Annuler
            </button>
          )}
        </form>

        <ul style={styles.list}>
          {partners.map((p) => (
            <li key={p.id} style={styles.listItem}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                {p.logo_url && (
                  <img src={p.logo_url} alt={p.name} style={styles.thumb} />
                )}
                <strong>{p.name}</strong>
              </span>
              <span style={styles.itemActions}>
                <button style={styles.smallButton} onClick={() => startEditPartner(p)}>
                  Modifier
                </button>
                <button style={styles.smallButtonDanger} onClick={() => deletePartner(p.id)}>
                  Supprimer
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
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
  link: { color: "#E8B84B", textDecoration: "none", fontSize: "0.9rem" },
  errorBanner: {
    background: "rgba(193,80,46,0.2)",
    border: "1px solid #C1502E",
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    marginBottom: "1.5rem",
  },
  section: {
    background: "#1B1B3A",
    border: "1px solid #26264A",
    borderRadius: "12px",
    padding: "1.5rem",
    marginBottom: "2rem",
  },
  subtitle: { fontSize: "1.1rem", marginTop: 0, marginBottom: "1rem" },
  form: { display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" },
  input: {
    padding: "0.6rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid #26264A",
    background: "#14131F",
    color: "#F5EFE3",
    flex: "1 1 180px",
  },
  button: {
    padding: "0.6rem 1.2rem",
    borderRadius: "8px",
    border: "none",
    background: "#E8B84B",
    color: "#14131F",
    fontWeight: 700,
    cursor: "pointer",
  },
  buttonSecondary: {
    padding: "0.6rem 1.2rem",
    borderRadius: "8px",
    border: "1px solid #C9C4B6",
    background: "transparent",
    color: "#F5EFE3",
    cursor: "pointer",
  },
  list: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.6rem" },
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#14131F",
    border: "1px solid #26264A",
    borderRadius: "8px",
    padding: "0.6rem 0.9rem",
  },
  itemActions: { display: "flex", gap: "0.5rem" },
  itemMeta: { fontSize: "0.75rem", color: "#C9C4B6" },
  tagBadge: {
    fontSize: "0.7rem",
    color: "#C9C4B6",
    border: "1px solid #26264A",
    borderRadius: "999px",
    padding: "0.1rem 0.5rem",
    marginLeft: "0.5rem",
  },
  thumb: { width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover" },
  smallButton: {
    padding: "0.35rem 0.7rem",
    borderRadius: "6px",
    border: "1px solid #E8B84B",
    background: "transparent",
    color: "#E8B84B",
    fontSize: "0.75rem",
    cursor: "pointer",
  },
  smallButtonDanger: {
    padding: "0.35rem 0.7rem",
    borderRadius: "6px",
    border: "1px solid #C1502E",
    background: "transparent",
    color: "#C1502E",
    fontSize: "0.75rem",
    cursor: "pointer",
  },
};
