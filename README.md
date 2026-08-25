# Mon agenda — version 11.1 bêta

Application personnelle et gratuite pour gérer sur iPhone les rendez-vous, clientes, indisponibilités, paiements et bilans d’une prothésiste ongulaire à domicile. Après la première ouverture en ligne, l’agenda et les données restent utilisables hors connexion.

La mention **bêta** est volontaire : cette version contient une refonte importante. Elle doit être testée plusieurs jours en conditions réelles avant d’être considérée comme stable.

## Nouveautés principales

- vues **Jour**, **Semaine** et **Mois** avec grille horaire, ligne de l’heure actuelle, week-ends et jours fériés visibles ;
- heure de la première cliente et heure de fin de la dernière cliente affichées dans le résumé du jour ;
- petits blocs lisibles dans la semaine, conflits disposés côte à côte et accès direct à la modification en touchant un rendez-vous ;
- bouton central **+** limité à deux choix clairs : nouveau rendez-vous ou nouvelle indisponibilité ;
- **Ma tournée** regroupant les adresses du jour, avec lancement de Waze ;
- Waze également disponible dans le prochain rendez-vous et dans la fiche de modification ;
- création réordonnée : cliente, téléphone, prestation et prix, date et heure, durée, statut, adresse, notes du rendez-vous ;
- cliente reconnue à partir du nom ou du téléphone, avec proposition de la fiche existante et alerte en cas de doublon probable ;
- nouveau rendez-vous **Confirmé** par défaut ;
- paiement initial **À vérifier**, sans date inventée ;
- carte **Clôturer ma journée** après le dernier rendez-vous et alerte pour les anciennes journées non clôturées ;
- depuis la clôture : paiement daté au jour du rendez-vous ou choix **À régler** avec date de relance ;
- rappel visible à la date choisie pour relancer la cliente ;
- paiement, prochain rendez-vous récurrent et motif d’annulation visibles seulement lors de la modification d’un rendez-vous ;
- date et heure du prochain rendez-vous récurrent modifiables ;
- indisponibilités avec début, fin, journée entière, motif, adresse et commentaire ;
- avertissement de conflit, d’horaire inhabituel, de week-end ou de jour férié, avec possibilité de valider quand même ;
- notes cliente séparées des notes de rendez-vous ;
- bilan semaine/mois : clientes, rendez-vous, paiements, heures travaillées et heures encore planifiées ;
- horaires de travail réglables, par défaut du lundi au vendredi de 9 h à 19 h ;
- prestations par défaut : Pose complète, Remplissage, Dépose, Renfort et Semi-permanent, avec huit couleurs ;
- brouillon automatique d’un nouveau rendez-vous ;
- bouton **Annuler** temporaire après une création, modification, suppression, déplacement ou changement de paiement ;
- mise à jour proposée par un bandeau : elle n’est appliquée qu’après validation et ne supprime pas les données.

## Assistant local écrit et vocal

Le bouton rose **Assistant** ouvre un assistant gratuit capable notamment de :

- préparer un rendez-vous en français naturel ;
- chercher des créneaux disponibles ;
- résumer une journée ;
- déplacer ou annuler un rendez-vous ;
- ouvrir la clôture ou les relances de paiement.

La version 11.1 sait poursuivre une demande sur plusieurs messages : elle redemande seulement les informations manquantes et comprend les corrections avant validation. Toute écriture affiche d’abord un résumé et demande une confirmation. Le micro est en mode **appuyer pour parler** : il n’écoute jamais en permanence. Après une demande au micro, la réponse est lue automatiquement ; une demande écrite reste silencieuse. L’analyse des demandes est locale et aucune API payante n’est utilisée. La reconnaissance et la lecture vocales dépendent toutefois des fonctions disponibles dans Safari/iOS et peuvent nécessiter l’autorisation du micro ou une connexion ; le mode écrit reste disponible hors ligne.

## Données, sauvegarde et restauration

Les données restent dans le navigateur de l’iPhone et ne sont pas envoyées sur GitHub. GitHub Pages héberge uniquement les fichiers de l’application.

La sauvegarde JSON contient clientes, notes clientes, rendez-vous, notes de rendez-vous, paiements, relances, indisponibilités, horaires, prestations, couleurs et réglages. La restauration adapte automatiquement une sauvegarde d’ancienne version au format actuel. Une sauvegarde provenant d’une version future ou contenant des données abîmées est refusée sans modifier l’agenda.

Avant une restauration et avant la migration depuis la version précédente, une copie locale de sécurité est créée. Les boutons correspondants apparaissent dans **Réglages** lorsqu’une récupération est possible.

Même si la migration est automatique, fais régulièrement **Réglages → Sauvegarder dans Fichiers** : les données locales d’une PWA peuvent disparaître si Safari est réinitialisé ou si le stockage du site est supprimé.

## Publication avec GitHub Desktop

1. Fais d’abord une sauvegarde depuis la version actuellement installée sur l’iPhone.
2. Ouvre le dépôt local `mon-agenda` avec **Show in Explorer**.
3. Remplace les fichiers de l’application par les huit fichiers de cette archive.
4. Dans GitHub Desktop, saisis par exemple `Version 11.1 beta` puis clique sur **Commit to main**.
5. Clique sur **Push origin**.
6. Après une à deux minutes, ouvre `https://bd87b9495f-blip.github.io/mon-agenda/?v=11.1` sur l’iPhone.
7. Si le bandeau **Nouvelle version disponible** apparaît, touche **Mettre à jour**.
8. Vérifie dans **Réglages** que `Mon agenda · version 11.1 bêta` est affiché.

Si l’ancienne interface reste visible, ferme complètement l’application ajoutée à l’écran d’accueil, ouvre une fois l’adresse avec `?v=11.1` dans Safari, accepte la mise à jour, puis relance l’application.
