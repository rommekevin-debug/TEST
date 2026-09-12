# Publier ProKil sur le Google Play Store

ProKil est une PWA (Progressive Web App). Pour la publier sur le Play Store, on l'empaquette dans une **TWA** (Trusted Web Activity) : une coque Android minimale qui affiche le site en plein écran, sans barre de navigateur. L'appli continue de charger le contenu réel depuis GitHub Pages.

Ce dossier contient la config prête à l'emploi (`twa-manifest.json`). Les étapes ci-dessous sont à faire **toi-même**, car elles nécessitent ton compte Google Play et ta propre clé de signature (que je ne dois jamais générer ni détenir à ta place).

## 0. Prérequis (une seule fois)

- [Node.js](https://nodejs.org/) installé sur ton ordinateur.
- Un JDK 17 installé.
- Un compte [Google Play Console](https://play.google.com/console) (25 $, paiement unique, vérification d'identité requise par Google).
- Le site publié et accessible en HTTPS sur GitHub Pages (voir plus bas : `https://rommekevin-debug.github.io/TEST/`).

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

## 6. Créer la fiche et publier sur Google Play Console

1. Crée une nouvelle application dans la [Play Console](https://play.google.com/console).
2. Renseigne la fiche store (voir `store-listing.md` dans ce dossier pour un texte prêt à copier).
3. Ajoute la politique de confidentialité (voir `privacy-policy.md`, à héberger quelque part en public — par exemple comme page GitHub Pages, `https://rommekevin-debug.github.io/TEST/privacy.html`).
4. Uploade le fichier `.aab` dans la section "Production" (ou "Test interne" pour tester d'abord).
5. Remplis le questionnaire de classification de contenu et les informations de confidentialité des données (ProKil ne collecte et n'envoie aucune donnée personnelle à un serveur — tout reste en local sur l'appareil, hormis les adresses saisies qui sont envoyées à OpenStreetMap/OSRM pour le calcul d'itinéraire).
6. Soumets pour validation (délai habituel : quelques heures à quelques jours).

## Mettre à jour l'appli plus tard

À chaque changement du site, il suffit de pousser sur `main` (GitHub Pages se met à jour automatiquement). Si tu changes le contenu de l'appli TWA elle-même (rare), augmente `appVersionCode`/`appVersion` dans `twa-manifest.json`, relance `bubblewrap update` puis `bubblewrap build`, et uploade le nouvel `.aab` dans la Play Console.
