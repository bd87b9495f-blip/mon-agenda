# Validation Atelier — build 2026.15.2

Version visible `2026.15` · build `2026.15.2` · données `v16` · IndexedDB technique `v3` · JSON `v4`.

Cette livraison est une candidate à la recette iPhone, pas un déploiement. Les modifications sont réalisées dans une copie distincte de l’archive de départ. Aucune donnée personnelle n’est incluse dans les tests.

## Contrôles exécutés

Commande, depuis la racine du projet :

```bash
node --test tests/*.test.mjs
```

Résultat final : **184 / 184 tests réussis**, aucun échec, aucun test ignoré ou annulé. Exécution sous Node.js 24.22.1, code de sortie 0. Le journal complet figure dans `VALIDATION-NODE.txt`, produit sur les fichiers livrés. Les 154 tests de départ sont conservés ; leurs attentes de build, de schéma et de structure sont adaptées au build 2026.15.2 et au schéma v16. S’y ajoutent 10 tests de stockage et 20 tests de parcours Atelier. Aucun garde-fou financier n’est retiré.

Les 351 identifiants du HTML de départ restent présents ; la version livrée en compte 390, tous uniques. Les fichiers source extraits de l’archive initiale sont restés identiques à cette archive ; le travail est livré séparément.

| Domaine | Preuve exécutée |
|---|---|
| Syntaxe, livraison et PWA | Scripts valides, versions cohérentes, ressources et icônes présentes, cache par build, barrière avant accès aux données, maintien des brouillons lors d’une prise de contrôle |
| Finances | Suite historique : dates réelles, relance requise, remboursements, annulations/absences, zéro distinct du prix absent, verrou et suppression protégée, Bilan et CSV |
| Migration et intégrité | JSON v15 toujours vérifiable, empreinte v15 identique à la référence de départ, migration vers v16 et liste de tâches vide, contrôles des versions et de l’enveloppe |
| Stockage des tâches | Store ajouté à la montée IndexedDB 2 → 3, snapshot exact avant migration, compteurs/empreintes, création/achèvement/réouverture/suppression, reprise et restauration |
| Échecs de stockage | Quota métier annule atomiquement la transaction ; distinction du quota de copie automatique ; conflit entre deux fenêtres et état orphelin bloqués |
| Parcours RDV | Exécution des gestionnaires Ajouter → RDV → enregistrer → retrouver dans le planning → ouvrir le paiement, avec paiement initial À vérifier |
| Saisie et propositions | Date/heure libres ; durée et prix proposés puis ajustables ; zéro conservé ; suggestions excluant pauses, chevauchements, événements bloquants multi-jours et débordement de la veille |
| To Do | Ajout, validation, achèvement, réouverture, suppression confirmée, échec d’écriture avec retour à l’état commis, brouillon et protection à la fermeture |
| Dépenses | Duplication dans une nouvelle saisie, date du jour, catégorie historique conservée, enregistrement explicite |
| Discrétion | Montants de consultation masqués, données et calculs inchangés, export CSV identique et non masqué |
| Apparence | Thème/densité enregistrés sans modifier les horaires ; IDs uniques, références ARIA/labels et noms des dialogues cohérents |
| Rafraîchissement minute | Le DOM simulé constate que les blocs du planning Jour ne sont plus reconstruits ; la référence du bouton, le focus et la position de défilement sont conservés |

Les tests d’intégration utilisent le HTML réellement livré et un DOM simulé qui n’invente pas les identifiants absents. Les tests de stockage utilisent une simulation IndexedDB transactionnelle. Ils ne remplacent pas le moteur WebKit ni le stockage réel d’un iPhone. Les contrastes des principales couleurs de texte et de leurs fonds ont été calculés ; le rendu complet et les états superposés restent à vérifier visuellement.

## Limites connues de la validation

- Aucun navigateur exécutable n’est disponible dans l’environnement de livraison : aucune validation pixel, tactile ou WebKit n’est annoncée.
- Aucun gain de vitesse chiffré n’est revendiqué. Le changement du rafraîchissement évite une reconstruction périodique observée dans le code et vérifiée dans le DOM simulé ; son bénéfice réel sur iPhone reste à mesurer.
- Hors ligne, Fichiers, Waze, clavier virtuel, VoiceOver, mise à jour de la PWA et persistance après fermeture forcée nécessitent un appareil réel.
- Les tests ont lieu sur des données fictives et sur les règles de l’application ; aucune base personnelle de l’utilisatrice n’a été importée ni modifiée.

## Recette iPhone avant usage quotidien

Utiliser une installation de recette et des données fictives. Avant de mettre à jour une installation existante, exporter et vérifier son JSON v15. Conserver l’archive de départ et suivre `GUIDE-MISE-A-JOUR.md` ; ne pas effacer Safari ni désinstaller la PWA.

| Information | À renseigner |
|---|---|
| Date / personne | |
| Modèle d’iPhone / iOS | |
| URL / version précédente | |
| Version et build observés | |
| Sauvegarde de départ vérifiée | |
| Résultat final | accepté / refusé |

- [ ] Ouvrir une seule fenêtre de Mon agenda. Vérifier la migration v15 → v16 et comparer clientes, rendez-vous, dépenses, paiements, catégories, prestations et suppléments avant/après. La liste des tâches doit être initialement vide.
- [ ] Ouvrir la PWA : Agenda/Jour montre la date du jour. Tester une journée vide, une journée chargée et deux rendez-vous superposés ; contrôler les durées et les heures lisibles en Confortable puis Compact.
- [ ] Parcourir Jour, Semaine, Mois et le programme d’un jour depuis Mois ; vérifier recherche, retour Aujourd’hui et commandes Ajouter.
- [ ] Créer un RDV libre sans consulter de créneaux. Choisir une prestation, ajuster durée et prix, choisir une heure occupée et vérifier l’avertissement. Confirmer malgré le chevauchement puis retrouver le RDV.
- [ ] Tester les suggestions avec une pause, un événement bloquant, un événement informatif et un blocage sur plusieurs journées ; sélectionner une suggestion puis modifier librement la date et l’heure.
- [ ] Utiliser le clavier pendant un changement de minute : conserver saisie, focus et défilement. Fermer un formulaire modifié, conserver puis reprendre son brouillon.
- [ ] Créer deux clientes homonymes, les sélectionner séparément, consulter l’historique complet et reprendre un ancien RDV sans fusion.
- [ ] Tester les quatre états de paiement, les dates réelles, la relance obligatoire, le prix vide puis zéro, le verrou après paiement, le remboursement ultérieur et l’annulation sans disparition des flux.
- [ ] Ouvrir À suivre depuis différentes dates : retrouver confirmations, relances et journées non clôturées. Ouvrir Journée, Fin de journée, Ma tournée et Waze.
- [ ] Créer une tâche sans date puis une tâche avec date, la modifier, la terminer, la remettre à faire et la supprimer. Fermer et relancer ; contrôler le brouillon et la persistance.
- [ ] Ajouter et dupliquer une dépense, contrôler date/montant et une catégorie historique ; annuler une duplication sans créer d’écriture.
- [ ] Tester le Bilan dans les quatre périodes et les trois rubriques. Comparer CSV et écran ; ouvrir le CSV dans Numbers. Net = brut − remboursements, indépendamment des dépenses.
- [ ] Activer la discrétion : contrôler agenda, recherche, fiche cliente, Bilan et listes de suivi, également avec VoiceOver. Vérifier que les exports restent exacts et que l’ouverture d’un formulaire financier propose de réafficher les montants.
- [ ] Choisir Clair puis Sombre dans l’app, changer le thème de l’iPhone et vérifier que le choix de l’app reste indépendant. Contrôler contraste, taille de texte augmentée, réduction des animations, zones de sécurité et cibles tactiles.
- [ ] Exporter un JSON v16 avec des tâches, le vérifier, le restaurer puis revenir aux données précédant la restauration. Comparer les tâches et les autres entités à chaque étape. Tester les copies automatiques et un JSON altéré dans l’installation de recette.
- [ ] Charger une fois en ligne, activer le mode Avion, relancer, créer un RDV et une tâche, fermer puis relancer sans perte. Revenir en ligne et contrôler les données.
- [ ] Tester une mise à jour avec une saisie non enregistrée : pas de rechargement destructif. Ouvrir deux fenêtres de Mon agenda : le conflit doit bloquer la migration/écriture ambiguë. Un autre site Safari ne doit pas bloquer Mon agenda.

Consigner chaque anomalie avec les étapes, le résultat attendu, le résultat observé, le modèle/iOS, la reproductibilité et le risque éventuel pour les données. Une anomalie financière ou de persistance bloque la mise en service.

## Mesures de performance reproductibles à réaliser

Le protocole compare l’archive 2026.15.1 et Atelier sur le même iPhone, le même iOS et deux origines de recette distinctes. Exporter le jeu fictif v15 une seule fois et le restaurer dans chaque version ; Atelier effectue sa migration. Ne pas rétrograder une même base v16 avec l’ancien code.

1. Constituer trois jeux fictifs de 1 000, 5 000 et 20 000 rendez-vous, répartis sur cinq ans, avec cinq rendez-vous par cliente, 10 % d’annulations et 10 % de paiements en attente, plus des dépenses et événements sur des dates fixées. Conserver les trois JSON exacts afin de réutiliser strictement les mêmes données.
2. Pour chaque jeu et chaque version, effectuer cinq passages de chauffe puis 30 mesures des mêmes actions : ouverture, changement Jour/Semaine/Mois, saisie de la même recherche, ouverture d’une fiche avec historique et Bilan annuel. Conserver médiane et 95e percentile, et relever les longues tâches dans les outils WebKit.
3. Enregistrer une trace de 90 secondes sur une journée chargée, faire défiler et maintenir le focus sur un RDV pendant un changement de minute. Comparer reconstructions DOM, perte de focus, sauts de défilement et saccades.
4. Refaire les parcours hors ligne avec une saisie en cours. Mesurer séparément le temps d’enregistrement et le rendu suivant ; vérifier les données après relance. Une amélioration apparente qui retire une protection ou perd une écriture est un échec.
5. Consigner appareil, iOS, taille exacte du JSON, nombre de chaque entité, état en ligne/hors ligne et niveau de batterie. Ne comparer que des séries réalisées dans les mêmes conditions.

Ces mesures de latence et cette recette iPhone restent à faire ; aucun résultat fictif n’est présenté comme une mesure exécutée.
