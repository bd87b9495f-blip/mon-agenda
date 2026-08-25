# Mon agenda — version 10

Application personnelle et gratuite, utilisable hors ligne sur iPhone, pour gérer des rendez-vous de prothésiste ongulaire à domicile.

## Nouveautés de la version 10

- vue **Jour** avec heures de début de la première cliente et de fin de la dernière cliente ;
- vue **Semaine** sous forme de vraie grille horaire sur 7 colonnes, avec petits blocs colorés, conflits côte à côte, week-ends, jours fériés et indisponibilités « journée entière » ;
- formulaire de création simplifié et réordonné : cliente, téléphone, prestation, prix, date, heure, durée, statut, adresse et notes du rendez-vous ;
- nouveau rendez-vous **Confirmé** par défaut ;
- paiement, date et moyen de paiement, prochain rendez-vous et motif d’annulation visibles uniquement lors de la modification d’un rendez-vous ;
- notes de la fiche cliente clairement séparées des notes du rendez-vous ;
- suggestions de clientes à partir de 2 lettres, sans liste gênante à l’ouverture d’un rendez-vous existant ;
- correction du zoom automatique de Safari lors de la saisie sur iPhone ;
- bouton **Suivi de journée** : vérification des rendez-vous d’un jour, navigation dans les jours précédents, validation des paiements ou choix d’une date de relance ;
- rappel visible sur l’accueil à la date choisie : `Relancer « cliente » pour le paiement` ;
- paiement validé depuis le suivi daté au jour du rendez-vous, ou daté au jour réel lorsqu’il est validé depuis une relance ;
- prestations par défaut : Pose complète, Remplissage, Dépose, Renfort et Semi-permanent ; les prestations et réglages existants sont conservés ;
- huit couleurs de prestations ;
- indicateur **Heures travaillées** dans le bilan semaine/mois, hors annulations et absences ;
- sauvegarde complète et versionnée des clientes, deux types de notes, rendez-vous, paiements, relances, indisponibilités, horaires, prestations, couleurs et réglages.

Les fonctions déjà présentes restent disponibles : conflits avec validation forcée, créneaux bloqués avec dates/heures/adresse/commentaire, horaires modifiables, fiches clientes et historique, prochain rendez-vous récurrent avec date et heure ajustables, Waze, bilan et restauration sécurisée.

## Données et mise à jour

Les données restent dans le navigateur de l’iPhone et ne sont pas envoyées sur GitHub. Avant une mise à jour, lance **Sauvegarder dans Fichiers** depuis Réglages.

Une sauvegarde contient toutes les données et tous les réglages, mais pas l’ancien code. La version 10 migre automatiquement les données de la version 9. Restaurer une ancienne sauvegarde remet donc son contenu dans la nouvelle application sans revenir à l’ancienne interface. Une restauration invalide est annulée entièrement et une copie locale permet d’annuler la dernière restauration.

## Publication avec GitHub Desktop

1. Ouvre le dossier local du dépôt `mon-agenda` avec **Show in Explorer**.
2. Remplace les sept fichiers de l’application par ceux de cette archive.
3. Dans GitHub Desktop, saisis par exemple `Version 10` puis clique sur **Commit to main**.
4. Clique sur **Push origin**.
5. Après une à deux minutes, ouvre `https://bd87b9495f-blip.github.io/mon-agenda/?v=10` sur l’iPhone.
6. Vérifie dans **Réglages** que `Mon agenda · version 10.0` est affiché.

Après la première ouverture en ligne, l’application continue de fonctionner hors connexion. Si l’ancienne interface reste visible, ferme complètement l’application Safari/PWA puis rouvre l’adresse avec `?v=10`.
