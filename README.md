# ProKil

Application web (HTML/CSS/JS, sans dépendance ni serveur) pour les professionnels itinérants qui doivent suivre leurs frais kilométriques.

## Fonctionnalités

- **Calculateur de trajet** : distance, aller-retour, coût carburant calculé à partir du prix actuel du carburant et de la consommation moyenne du véhicule.
- **Indemnisation employeur** : taux fixe (€/km) défini par l'utilisateur, ou barème fiscal kilométrique indicatif (selon la puissance fiscale du véhicule et le cumul kilométrique annuel).
- **Solde par trajet** : différence entre l'indemnité perçue et le coût réel du carburant.
- **Historique** : liste des trajets, totaux (distance, carburant, indemnités, solde), export CSV pour notes de frais, suppression de trajets.
- **Stockage local** : toutes les données restent dans le navigateur (`localStorage`), aucune donnée envoyée à un serveur.
- **Interface responsive** : pensée pour une utilisation sur mobile/tablette en déplacement, avec thème clair/sombre automatique.

## Utilisation

Ouvrir simplement `index.html` dans un navigateur (aucune installation ni build nécessaire). Configurer d'abord l'onglet **Paramètres** (prix du carburant, consommation du véhicule, taux ou barème d'indemnisation), puis utiliser l'onglet **Calculateur** pour chaque trajet.

> Le barème fiscal proposé est indicatif ; vérifiez chaque année le barème officiel en vigueur auprès de l'administration fiscale avant de l'utiliser pour une déclaration.
