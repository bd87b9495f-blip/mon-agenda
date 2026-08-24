# Mon agenda — version 8

Application personnelle hors ligne pour gérer des rendez-vous à domicile.

## Cette version

- planning journalier lisible, vue semaine et aperçu depuis le mois ;
- week-ends et jours fériés de France métropolitaine identifiés ;
- créneaux bloqués avec début, fin, motif ou option **Toute la journée** ;
- horaires de travail modifiables dans Réglages, avec coupure facultative ;
- fiches clientes, recherche, remplissage automatique, historique et suivi des annulations/absences ;
- prestations enregistrées : durée, prix et couleur se remplissent automatiquement ;
- statut de rendez-vous, paiement et date de paiement modifiable ;
- nouveau rendez-vous marqué **Payé** à la date du jour par défaut ;
- prochain rendez-vous calculé à 2, 3, 4 ou 5 semaines, avec sa date modifiable avant l’enregistrement ;
- alerte de conflit, avec possibilité de valider quand même ;
- raccourcis Waze compacts et itinéraire du jour ;
- bloc **À faire** pour les rendez-vous à confirmer et paiements à régler ;
- page **Bilan** filtrable par semaine ou mois : activité, clientes, encaissements et impayés ;
- sauvegarde versionnée : les anciennes sauvegardes sont migrées automatiquement ;
- contrôle complet avant restauration, refus des sauvegardes trop récentes et copie de secours locale permettant d’annuler la dernière restauration.

## Données

Les rendez-vous sont enregistrés sur l'appareil dans le navigateur. Ils ne sont pas stockés sur GitHub. Fais une sauvegarde régulière depuis l'icône `⇩`, puis vérifie que le fichier JSON apparaît bien dans l’app **Fichiers** de l’iPhone.

Une sauvegarde contient les données, pas l’ancien code de l’application. Après une mise à jour, restaurer un ancien fichier remet donc les clientes, rendez-vous, prestations, paiements, blocages et réglages dans la nouvelle version. La migration est automatique et la restauration est annulée entièrement si une donnée est abîmée.

## Mise à jour GitHub Pages

Avec GitHub Desktop, copie le contenu de ce dossier sur le dépôt cloné, puis crée un commit et utilise **Push origin**. GitHub Pages se met à jour automatiquement. Pour forcer l’ouverture de cette version après le déploiement, utilise `https://bd87b9495f-blip.github.io/mon-agenda/?v=8`.
