// ============================================================================
// MIGRATION SUPABASE LOCAL -> CLOUD
//
// Copie les catégories, candidats et partenaires depuis ta base Supabase
// locale vers ton nouveau projet Supabase cloud — photos et logos compris
// (téléchargés depuis le stockage local, puis ré-uploadés dans le cloud).
//
// UTILISATION :
//   env LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
//       LOCAL_SERVICE_ROLE_KEY=xxxxx \
//       CLOUD_SUPABASE_URL=https://xxxxx.supabase.co \
//       CLOUD_SERVICE_ROLE_KEY=xxxxx \
//       node scripts/migrate-to-cloud.mjs
//
// Prérequis : avoir déjà exécuté supabase/schema.sql sur le projet cloud
// (catégories/candidats d'exemple y seront écrasés par tes vraies données).
// ============================================================================

import { createClient } from "@supabase/supabase-js";

const required = [
  "LOCAL_SUPABASE_URL",
  "LOCAL_SERVICE_ROLE_KEY",
  "CLOUD_SUPABASE_URL",
  "CLOUD_SERVICE_ROLE_KEY",
];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Variable manquante : ${key}`);
    console.error("Voir l'en-tête de ce fichier pour l'exemple de commande.");
    process.exit(1);
  }
}

const local = createClient(process.env.LOCAL_SUPABASE_URL, process.env.LOCAL_SERVICE_ROLE_KEY);
const cloud = createClient(process.env.CLOUD_SUPABASE_URL, process.env.CLOUD_SERVICE_ROLE_KEY);

async function migrateImage(url, bucket) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  ⚠ Impossible de télécharger l'image (${res.status}) : ${url}`);
      return null;
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
    const buffer = Buffer.from(await res.arrayBuffer());
    const path = `migrated/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await cloud.storage
      .from(bucket)
      .upload(path, buffer, { contentType, upsert: false });
    if (uploadError) {
      console.warn(`  ⚠ Échec upload cloud : ${uploadError.message}`);
      return null;
    }
    const { data } = cloud.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.warn(`  ⚠ Erreur migration image : ${err.message}`);
    return null;
  }
}

async function migrateCategories() {
  const { data: categories, error } = await local.from("categories").select("*");
  if (error) throw error;

  for (const c of categories) {
    const { error: upsertError } = await cloud.from("categories").upsert(c);
    if (upsertError) console.error(`  ✗ Catégorie "${c.label}" : ${upsertError.message}`);
  }
  console.log(`✓ ${categories.length} catégorie(s) migrée(s)`);
  return categories;
}

async function migrateCandidates() {
  const { data: candidates, error } = await local.from("candidates").select("*");
  if (error) throw error;

  for (const cand of candidates) {
    process.stdout.write(`  → ${cand.name}...`);
    const newPhotoUrl = await migrateImage(cand.photo_url, "candidate-photos");
    const { error: upsertError } = await cloud
      .from("candidates")
      .upsert({ ...cand, photo_url: newPhotoUrl || cand.photo_url });
    if (upsertError) {
      console.log(` ✗ ${upsertError.message}`);
    } else {
      console.log(newPhotoUrl ? " ✓ (photo migrée)" : " ✓ (sans photo)");
    }
  }
  console.log(`✓ ${candidates.length} candidat(s) migré(s)`);
}

async function migratePartners() {
  const { data: partners, error } = await local.from("partners").select("*");
  if (error) throw error;

  for (const p of partners) {
    process.stdout.write(`  → ${p.name}...`);
    const newLogoUrl = await migrateImage(p.logo_url, "partner-logos");
    const { error: upsertError } = await cloud
      .from("partners")
      .upsert({ ...p, logo_url: newLogoUrl || p.logo_url });
    if (upsertError) {
      console.log(` ✗ ${upsertError.message}`);
    } else {
      console.log(newLogoUrl ? " ✓ (logo migré)" : " ✓ (sans logo)");
    }
  }
  console.log(`✓ ${partners.length} partenaire(s) migré(s)`);
}

async function main() {
  console.log("=== Migration Supabase local → cloud ===\n");

  console.log("Catégories...");
  await migrateCategories();

  console.log("\nCandidats (avec photos)...");
  await migrateCandidates();

  console.log("\nPartenaires (avec logos)...");
  await migratePartners();

  console.log("\n=== Migration terminée ! ===");
  console.log("\nIl te reste à faire manuellement :");
  console.log("  1. Recréer ton compte admin dans Authentication > Users (projet cloud)");
  console.log("  2. Exécuter : insert into admin_users (email) values ('ton-email@exemple.com');");
}

main().catch((err) => {
  console.error("\n✗ Erreur fatale :", err.message);
  process.exit(1);
});
