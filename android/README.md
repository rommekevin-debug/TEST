# Publier ProKil sur le Google Play Store

ProKil est une PWA (Progressive Web App). Pour la publier sur le Play Store, on l'empaquette dans une **TWA** (Trusted Web Activity) : une coque Android minimale qui affiche le site en plein écran, sans barre de navigateur. L'appli continue de charger le contenu réel depuis GitHub Pages.

Ce dossier contient la config prête à l'emploi (`twa-manifest.json`). Les étapes ci-dessous sont à faire **toi-même**, car elles nécessitent ton compte Google Play et ta propre clé de signature (que je ne dois jamais générer ni détenir à ta place).

## 0. Prérequis (une seule fois)

- Un compte [Google Play Console](https://play.google.com/console) (25 $, paiement unique, vérification d'identité requise par Google).
- Le site publié et accessible en HTTPS sur GitHub Pages (voir plus bas : `https://rommekevin-debug.github.io/TEST/`).
- **Si tu as un ordinateur** : [Node.js](https://nodejs.org/) + un JDK 17, pour utiliser Bubblewrap (étapes 3-5 ci-dessous).
- **Si tu n'as qu'un téléphone/tablette Android** : aucun outil à installer, tout se fait depuis un navigateur — va directement à la section **"Pas d'ordinateur ? Publier depuis un téléphone Android"** plus bas, qui remplace les étapes 2 à 5.

## 1. Activer GitHub Pages (une fois la PR fusionnée sur `main`)

Dans les paramètres du dépôt GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**. Le workflow `.github/workflows/deploy-pages.yml` déjà présent dans ce dépôt se charge ensuite de publier automatiquement à chaque push sur `main`. L'appli sera visible à `https://rommekevin-debug.github.io/TEST/`.

## 2. Ajuster `twa-manifest.json`

Ouvre `android/twa-manifest.json` et vérifie/adapte :
- `packageId` : identifiant unique de l'appli (ex. `com.tonnom.prokil`), format inversé de nom de domaine. **Impossible à changer après la première publication**, choisis-le avec soin.
- `host` / `webManifestUrl` / `fullScopeUrl` / `iconUrl` : à ajuster si tu changes de nom de dépôt ou utilises un domaine personnalisé.

## 3. Installer Bubblewrap et générer le projet Android

```bash
npm install -g @bubblewrap/cli
cd android
bubblewrap init --manifest ./twa-manifest.json
```

Bubblewrap va te demander de créer une **clé de signature** (keystore) si tu n'en as pas — choisis un mot de passe fort et **conserve précieusement ce fichier `android.keystore` et son mot de passe** : sans eux, tu ne pourras plus jamais mettre à jour l'appli sur le Play Store.

## 4. Récupérer l'empreinte SHA-256 de ta clé et mettre à jour `assetlinks.json`

```bash
keytool -list -v -keystore android.keystore -alias prokil
```

Copie l'empreinte `SHA256` affichée, et remplace la valeur `REMPLACE_MOI_PAR_LEMPREINTE_SHA256_DE_TA_CLE_DE_SIGNATURE` dans `/.well-known/assetlinks.json` à la racine du dépôt. Ce fichier doit être accessible publiquement à `https://rommekevin-debug.github.io/TEST/.well-known/assetlinks.json` — commite et pousse ce changement pour que Google puisse vérifier que l'appli Android et le site web t'appartiennent tous les deux (Digital Asset Links). Sans cette étape, l'appli s'ouvrira avec une barre d'adresse visible au lieu du plein écran.

## 5. Construire l'Android App Bundle (.aab)

```bash
bubblewrap build
```

Ça produit un fichier `app-release-bundle.aab`, signé avec ta clé — c'est le fichier à uploader sur le Play Store.

## Pas d'ordinateur ? Publier depuis un téléphone Android

Tu peux faire tout le processus (sans Bubblewrap, sans terminal) avec **[PWABuilder](https://www.pwabuilder.com)**, un outil web gratuit de Microsoft qui fait exactement le même travail que Bubblewrap mais entièrement via navigateur — y compris depuis le navigateur Chrome de ton téléphone. Ça remplace les étapes 2 à 5 ci-dessus.

1. Ouvre **pwabuilder.com** dans Chrome sur ton téléphone.
2. Colle l'adresse de ton appli : `https://rommekevin-debug.github.io/TEST/` et lance l'analyse. PWABuilder doit détecter le manifest et le service worker automatiquement (icônes, nom "ProKil", etc.).
3. Une fois l'analyse terminée, va dans l'onglet **"Package for stores"** (ou "Publish") puis choisis **Android**.
4. Dans les options du package Android :
   - **Package ID** : mets `com.prokil.app` (ou l'identifiant que tu auras choisi — impossible à changer après la première publication sur le Store).
   - **Signing key** : choisis **"Create new signing key"** — PWABuilder génère la clé à ta place et te permet de **télécharger le `.keystore`**. Sauvegarde-le précieusement (par exemple dans ton Drive ou ailleurs en lieu sûr) : sans lui, impossible de mettre à jour l'appli plus tard.
   - Les autres champs (nom, couleur, icônes) sont déjà préremplis depuis le manifest de l'appli — tu peux les laisser tels quels.
5. Lance la génération : PWABuilder te renvoie un fichier `.zip` contenant le `.aab` signé (Android App Bundle) ainsi que le fichier `assetlinks.json` à publier.
6. Télécharge le `.zip` sur ton téléphone, ouvre-le avec une appli de gestion de fichiers pour en extraire le `.aab` et le `assetlinks.json`.
7. Mets à jour `/.well-known/assetlinks.json` à la racine du dépôt GitHub avec le contenu généré par PWABuilder (tu peux éditer le fichier directement sur github.com depuis le navigateur du téléphone : ouvre le fichier dans le dépôt, bouton crayon "Edit", colle le contenu, puis "Commit changes" sur la branche `main`). C'est cette étape qui permet à l'appli de s'ouvrir en plein écran plutôt qu'avec une barre d'adresse visible.
8. Le `.aab` téléchargé est le fichier à uploader dans la Play Console (étape 7 ci-dessous) — le site [play.google.com/console](https://play.google.com/console) fonctionne bien depuis un navigateur mobile pour créer la fiche et uploader le fichier.

Le reste du processus (créer le compte développeur, configurer l'abonnement ProKil Pro, remplir la fiche store) se fait entièrement sur le site de la Play Console, utilisable depuis un navigateur mobile.

## 6. Configurer l'abonnement ProKil Pro (Play Billing)

L'appli propose un abonnement "ProKil Pro" (historique illimité, rapport mensuel, barème fiscal personnalisable) avec 3 jours d'essai gratuit, géré nativement par Google Play — aucun serveur à toi n'est impliqué, Google gère le paiement et la facturation.

1. `twa-manifest.json` a déjà la fonctionnalité `playBilling` activée — elle installe le pont entre le site web (API [Digital Goods](https://developer.chrome.com/docs/android/trusted-web-activity/play-billing)) et Play Billing dans le projet Android généré par Bubblewrap.
2. Dans la Play Console, va dans **Monétiser → Produits → Abonnements** et crée un abonnement avec l'ID produit **`prokil_pro_monthly`** (cet identifiant est déjà câblé dans `script.js` — si tu en choisis un autre, remplace la constante `PRO_SKU` dans ce fichier).
3. Fixe le prix mensuel de ton choix, puis ajoute une **offre avec période d'essai gratuite de 3 jours** (Play Console : section "Offres" de l'abonnement → "Ajouter une offre" → phase d'essai gratuit, durée 3 jours).
4. Pour que le paiement fonctionne, l'appli doit être publiée au moins en **test interne** sur Play Console — l'API Play Billing ne répond pas tant que l'app n'est pas reconnue par le Store (y compris lors de tes propres tests).
5. L'abonnement n'est disponible que dans l'app Android installée depuis le Play Store — dans un navigateur classique (ou l'aperçu web), ProKil affiche un message indiquant que l'achat se fait via l'app Android, et le reste de l'appli fonctionne normalement en version gratuite.

## 7. Créer la fiche et publier sur Google Play Console

1. Crée une nouvelle application dans la [Play Console](https://play.google.com/console).
2. Renseigne la fiche store (voir `store-listing.md` dans ce dossier pour un texte prêt à copier).
3. Ajoute la politique de confidentialité (voir `privacy-policy.md`, à héberger quelque part en public — par exemple comme page GitHub Pages, `https://rommekevin-debug.github.io/TEST/privacy.html`).
4. Uploade le fichier `.aab` dans la section "Production" (ou "Test interne" pour tester d'abord, **recommandé** pour valider l'achat d'abonnement avant publication publique).
5. Remplis le questionnaire de classification de contenu et les informations de confidentialité des données (ProKil ne collecte et n'envoie aucune donnée personnelle à un serveur — tout reste en local sur l'appareil, hormis les adresses saisies qui sont envoyées à OpenStreetMap/OSRM pour le calcul d'itinéraire, et les informations de paiement de l'abonnement qui sont gérées directement par Google Play).
6. Soumets pour validation (délai habituel : quelques heures à quelques jours).

## Mettre à jour l'appli plus tard

À chaque changement du site, il suffit de pousser sur `main` (GitHub Pages se met à jour automatiquement) — **rien à refaire côté Android** pour la plupart des changements (texte, style, fonctionnalités) puisque l'app charge le contenu en direct depuis GitHub Pages.

Un nouveau `.aab` n'est nécessaire que si tu changes des réglages propres à l'enveloppe Android elle-même (icône, nom, couleur du thème, `packageId`...) — dans ce cas : augmente `appVersionCode`/`appVersion` dans `twa-manifest.json`, puis régénère le `.aab` (avec Bubblewrap : `bubblewrap update` puis `bubblewrap build` ; avec PWABuilder : relance le même processus sur pwabuilder.com en réutilisant ta clé de signature existante, option "Use existing signing key"), et uploade le nouveau fichier dans la Play Console.
