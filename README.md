# INFLUENCE AWARD — Site de vote

Site de vote payant (100 FCFA/vote) pour l'événement INFLUENCE AWARD (région de
Dosso). Next.js + Supabase + KomiPay (NITA, Amana, Airtel Money, Moov Flooz,
Zamani Cash).

## Architecture

```
app/
  page.js                          → Site public de vote
  vote/merci/page.js               → Page de confirmation après un vote réussi
  admin/login/page.js              → Connexion organisateur
  admin/manage/page.js             → Gestion catégories, candidats, partenaires
  admin/page.js                    → Tableau de bord (votes, revenus, export CSV)
  api/votes/initiate/route.js      → Crée la transaction + démarre le paiement KomiPay
  api/votes/check-status/route.js  → Interroge KomiPay pour un paiement STA en attente
  api/admin/*                      → Routes protégées (CRUD + statistiques)
lib/
  supabaseClient.js                 → Connexion Supabase (public + admin)
  payment.js                        → Couche de paiement KomiPay
  adminAuth.js                      → Vérification d'accès admin
supabase/
  schema.sql                        → Toute la base de données à exécuter une fois
```

## Comment fonctionne le paiement KomiPay

Deux familles de moyens de paiement, avec un comportement différent :

- **NITA / Amana** (Sociétés de Transfert d'Argent) : après avoir cliqué sur
  "Voter", le site affiche un panneau d'attente. Le votant doit ouvrir son
  application NITA ou Amana et valider la transaction (avec un code affiché
  à l'écran pour NITA). Le site vérifie automatiquement toutes les 6 secondes
  si le paiement est confirmé — **pas de redirection, pas de webhook à
  configurer**.
- **Airtel Money / Moov Flooz / Zamani Cash** : la confirmation est en
  général immédiate, le votant est redirigé directement vers la page de
  remerciement.

## 1. Mettre en place Supabase

1. Crée un projet sur [supabase.com](https://supabase.com) (ou utilise ton
   instance locale via `supabase start`).
2. Va dans **SQL Editor** et exécute le contenu de `supabase/schema.sql`.
3. Remplace les catégories/candidats d'exemple par les vrais (directement
   dans **Table Editor**, ou via `/admin/manage` une fois le site lancé).
4. Crée ton compte organisateur : **Authentication > Users > Add user**, puis
   ajoute cet email dans `admin_users` :
   ```sql
   insert into admin_users (email) values ('ton-email@exemple.com');
   ```
5. Récupère tes clés dans **Project Settings > API**.

## 2. Mettre en place KomiPay

1. Crée un compte sur [komipay.com](https://www.komipay.com) — pour tester
   d'abord, utilise plutôt le compte Sandbox :
   `http://sandbox.komipay.com:8181/index.php/register-user`.
2. Soumets tes documents d'identification (KYC) et attends la validation de
   KomiPay.
3. Une fois validé, va dans **Paramètres > Générer API** pour obtenir ta clé
   API. Garde-la strictement confidentielle.
4. Renseigne dans `.env.local` : ton `login` et `password` de connexion
   KomiPay, ta clé API, et `KOMIPAY_ENV=sandbox` (passe à `live` uniquement
   le jour de l'événement, une fois tout testé).

### Remplacer ou ajouter un fournisseur plus tard

Toute la logique de paiement est isolée dans `lib/payment.js`. Pour ajouter
un nouveau moyen (carte bancaire KomiPay, ou un tout autre fournisseur), il
suffit d'étendre ce fichier — aucun autre fichier du projet n'a besoin de
changer en profondeur.

## 3. Variables d'environnement

Copie `.env.example` vers `.env.local` et remplis toutes les valeurs.

## 4. Lancer en local

```bash
npm install
npm run dev
```

Site public : `http://localhost:3000`
Admin : `http://localhost:3000/admin/login`
Gestion catégories/candidats/partenaires : `http://localhost:3000/admin/manage`

## 5. Déployer

Le plus simple est [Vercel](https://vercel.com) :

1. Pousse ce projet sur GitHub.
2. Importe le repo sur Vercel.
3. Ajoute toutes les variables de `.env.example` dans **Settings > Environment
   Variables** (avec `KOMIPAY_ENV=live` pour la production).
4. Déploie.

### Limite de durée des fonctions (important)

La vérification de statut KomiPay (`check-transaction-status`) peut, côté
KomiPay, mettre du temps à répondre si le paiement est encore en attente.
Le projet limite chaque appel à 8 secondes et le frontend réessaie toutes
les 6 secondes — ça fonctionne sur le plan gratuit de Vercel. Si tu
constates des paiements qui mettent longtemps à se confirmer, c'est normal :
le votant doit valider dans son application, ce n'est pas un bug.

## Sécurité — ce qui est déjà géré

- Un vote n'est confirmé qu'après une réponse positive explicite de KomiPay
  (jamais avant, jamais sur simple clic).
- Le tableau de bord admin est protégé par authentification Supabase — seuls
  les emails listés dans `admin_users` y ont accès.
- La clé `service_role` (accès total à la base) ne circule jamais côté
  navigateur : elle reste sur le serveur (routes API uniquement).
- Les identifiants KomiPay (login, mot de passe, clé API) ne sont utilisés
  que côté serveur, jamais exposés au navigateur.

## Ce qui reste à ta charge avant l'événement

- Remplacer les candidats/catégories d'exemple par les vrais depuis
  `/admin/manage`.
- Tester un vrai paiement KomiPay en mode Sandbox avec chaque moyen de
  paiement avant de passer en `live`.
- Vérifier la charge attendue (nombre de votants simultanés) si l'audience
  est large.
