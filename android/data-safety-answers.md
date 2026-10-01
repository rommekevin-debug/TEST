# Formulaire "Sécurité des données" (Data safety) — réponses prêtes à cocher

À remplir dans Play Console une fois le compte validé : Fiche de l'application → Sécurité des données.

## Collecte et partage de données

**Votre application collecte-t-elle ou partage-t-elle des types de données utilisateur requis ?**
→ **Oui**

(ProKil envoie les adresses saisies par l'utilisateur à OpenStreetMap Nominatim et OSRM pour calculer les trajets — c'est un partage avec un service tiers, même si ProKil lui-même ne stocke rien sur un serveur.)

## Type de données : Localisation

- Coche **"Localisation approximative"** ou **"Adresse"** selon ce que propose le formulaire pour une adresse saisie manuellement (pas de GPS). Si l'option "Adresse postale" existe sous "Informations personnelles", utilise plutôt celle-là.
- **Cette donnée est-elle collectée, partagée, ou les deux ?** → **Partagée** (envoyée à OpenStreetMap/OSRM, pas stockée par ProKil)
- **Cette collecte est-elle facultative pour l'utilisateur ?** → **Oui** (le calcul auto de distance n'est utilisé que si l'utilisateur saisit des adresses)
- **Pourquoi cette donnée est-elle collectée ?** → **Fonctionnalité de l'application** (calcul d'itinéraire)

## Toutes les autres catégories (Infos personnelles, Finances, Messages, Photos/vidéos, etc.)

→ **Non collectées** pour toutes les autres catégories. En particulier :
- Pas de collecte d'e-mail, nom, téléphone (pas de compte utilisateur)
- Pas de données financières côté ProKil (l'abonnement Pro est géré entièrement par Google Play Billing, Google traite ces données, pas nous)
- Pas de photos/vidéos collectées (les photos de tickets restent en local sur l'appareil, jamais envoyées)
- Pas d'identifiants d'appareil, pas de données d'usage/analytics (aucun tracker)

## Sécurité des données

- **Les données sont-elles chiffrées en transit ?** → **Oui** (HTTPS pour les appels à Nominatim/OSRM)
- **Les utilisateurs peuvent-ils demander la suppression de leurs données ?** → **Oui** — préciser : *"Toutes les données sont stockées localement sur l'appareil ; désinstaller l'application ou vider les données du navigateur les supprime définitivement. Aucune donnée n'est conservée sur un serveur."*

## Engagement envers les Play Families Policies / autres cases à cocher

- Aucune des données n'est utilisée à des fins publicitaires (pas de pub dans l'app)
- Aucune donnée vendue à des tiers

---

Référence pour la politique de confidentialité à lier dans la fiche :
`https://rommekevin-debug.github.io/TEST/privacy.html`
