# Validation de la candidate 2026.15

Version visible `2026.15` · build `2026.15.0` · données `v15`.

## Statut au moment de la livraison

| Validation | État |
|---|---|
| Suite automatisée Node.js | réussie sur l’archive finale |
| Décompte final | `131 / 131` réussis, `0` échec |
| Actions GitHub | à vérifier après le push |
| Safari sur vrai iPhone | non exécuté |
| PWA installée sur vrai iPhone | non exécuté |
| Décision de lancement | en attente de la recette manuelle |

Les tests automatisés apportent une preuve reproductible sur les fonctions isolées et la cohérence des fichiers. Ils ne simulent pas complètement WebKit, le stockage persistant d’un appareil, la feuille de partage Fichiers, les gestes tactiles, VoiceOver ou le cycle réel d’une PWA iOS.

## 1. Rejouer la suite automatisée

Prérequis : Node.js disponible. Depuis la racine du projet :

```bash
node --test tests/*.test.mjs
```

Critères :

- aucun test en échec, annulé ou interrompu ;
- code de sortie `0` ;
- décompte final reporté dans le tableau ci-dessus ;
- même résultat dans l’Action GitHub **Contrôles de qualité**.

### Couverture automatisée actuelle

| Domaine | Vérifications principales |
|---|---|
| Livraison | syntaxe JavaScript, version/build, présence des ressources, manifeste et icônes |
| HTML et accessibilité structurelle | identifiants uniques, références DOM, noms de dialogues, relations ARIA et labels |
| Bilan et CSV | périodes, onglets, brut/remboursé/net, colonnes numériques, cohérence des totaux |
| Paiements | dates réelles, dates futures refusées, remboursement cohérent, net nul le même jour |
| Annulation et absence | paiements/remboursements conservés ; état À régler présent dans Bilan, rappel et CSV |
| Historique financier | prestation, prix et suppléments figés après paiement ou remboursement |
| Fin de journée | garde-fous des raccourcis et conservation de la date d’un paiement existant |
| Clientes | tous les homonymes exacts proposés séparément |
| Migration | contrôle brut, v14 vers v15, date ancrée, rappel manquant tracé, reprise identique et source v1 invalide bloquée sans migration partielle |
| Sauvegarde JSON | compteurs et empreinte v4, refus d’un état v15 sans enveloppe v4 complète, versions v3/v4 cohérentes et compatibilité historique v1/v3 |
| Remplacements complets | snapshot IndexedDB obligatoire, journal pending résistant aux interruptions, journaux homonymes divergents refusés, exclusion d’une seconde restauration et rollback concurrent |
| IndexedDB | première création atomique, intégrité, base orpheline, révision invalide bloquée, nouvelle lignée de récupération sous CAS, quarantaine et conflit entre fenêtres |
| Copies automatiques | état et contexte de migration protégés, ordre de fraîcheur, rotation à cinq, quota signalé sans perte du commit ordinaire et opération protégée refusée sans mutation |
| Stockage fail-closed et miroir | aucun repli inscriptible, provenance persistante après rotation, ancienne source exacte seule reconnue, variantes/lignées/alias ambigus préservés |
| Reprise après échec | délai borné sur ouverture et lectures de démarrage ; nouvel essai après premier commit échoué ou après relecture muette sans rejouer création, migration ni snapshot |
| PWA | cache limité au build courant, barrière avant toute lecture legacy, exactement une fenêtre exigée, brouillon conservé et rechargement différé |
| Interface mobile | contrôles essentiels du Bilan et demi-heures tactiles sans chevauchement |

## 2. Fiche de recette iPhone à remplir

Cette partie est volontairement laissée en attente. Elle doit être remplie par une exécution sur l’appareil destiné à l’usage réel.

| Information | Valeur à renseigner |
|---|---|
| Date de la recette |  |
| Personne ayant testé |  |
| Modèle d’iPhone |  |
| Version d’iOS |  |
| Version Safari |  |
| Version précédente réellement installée |  |
| URL publiée |  |
| Version et build observés |  |
| Sauvegarde v12.5 vérifiée avant migration |  |
| Résultat final | ☐ accepté · ☐ refusé |

## 3. Checklist manuelle restante

### Migration et persistance

- [ ] Avant la mise à jour, fermer toutes les autres fenêtres et tous les autres onglets Safari ouverts sur Mon agenda ainsi que toutes les instances de la PWA ; relancer une seule instance et vérifier qu’aucun ancien onglet ne reste actif pendant la migration.
- [ ] Mettre à jour une installation v12.5 contenant des données fictives existantes, sans désinstaller la PWA ni effacer Safari.
- [ ] Vérifier l’affichage `2026.15`, `données v15` et **Base sécurisée active**.
- [ ] Comparer les compteurs et plusieurs clientes, rendez-vous, événements, dépenses, catégories, paiements et suppléments avant/après.
- [ ] Fermer de force puis relancer l’application plusieurs fois sans perte ni doublon.
- [ ] Confirmer qu’une copie d’avant migration est disponible lorsqu’un ancien état a été migré.

### Agenda, clientes et enregistrements rapides

- [ ] Créer, modifier, déplacer et supprimer des données de test depuis l’iPhone.
- [ ] Enchaîner plusieurs sauvegardes rapides et doubles touchers ; vérifier l’absence de doublon et la persistance du dernier état.
- [ ] Créer deux clientes homonymes et choisir successivement chacune dans le dialogue multi-choix.
- [ ] Contrôler les thèmes Clair/Sombre, la grille tactile, les dialogues, les erreurs et le clavier.
- [ ] Parcourir les actions principales avec VoiceOver.

### Paiement, remboursement et Bilan

- [ ] Enregistrer un paiement à une date différente du rendez-vous et retrouver le brut dans la bonne période.
- [ ] Contrôler **✓ Payé aujourd’hui** pour un nouveau paiement et **✓ Payé** sans changement de date pour un paiement existant.
- [ ] Confirmer le refus des dates de paiement futures.
- [ ] Confirmer le verrou de la prestation, du prix et des suppléments après paiement/remboursement, puis tester la procédure de correction en trois enregistrements.
- [ ] Annuler puis marquer absent un rendez-vous payé sans faire disparaître le flux.
- [ ] Enregistrer un remboursement ultérieur et contrôler brut, remboursé et net sur les bonnes périodes.
- [ ] Confirmer le refus d’un remboursement futur ou antérieur au paiement.
- [ ] Annuler un rendez-vous **À régler** et retrouver la dette dans les rappels, la fiche cliente, le Bilan et le CSV.
- [ ] Vérifier qu’un futur rendez-vous **À vérifier** reste absent des contrôles jusqu’à la fin de son créneau.
- [ ] Ouvrir le CSV dans Numbers et comparer les nombres avec chaque rubrique affichée du Bilan.
- [ ] Répéter les contrôles essentiels du Bilan sur les périodes Jour, Semaine, Mois et Année.

### Sauvegarde et récupération

- [ ] Créer une sauvegarde dans Fichiers et la vérifier.
- [ ] Restaurer cette sauvegarde avec des données de recette.
- [ ] Utiliser **Revenir aux données d’avant la restauration** et vérifier le retour exact de l’état précédent.
- [ ] Créer une copie automatique, restaurer la dernière copie et vérifier le résultat.
- [ ] Provoquer seulement dans un environnement de recette l’ouverture de l’écran de récupération prévu, puis vérifier **Réessayer l’ouverture** et la création d’un diagnostic sans données personnelles.
- [ ] Pendant cet écran, vérifier qu’aucune donnée métier ni aucun miroir n’est écrit et qu’aucun mode de repli local ne permet de continuer à modifier l’agenda.

### PWA, mise à jour et hors-ligne

- [ ] Tester Safari puis la PWA lancée depuis l’écran d’accueil.
- [ ] Après chargement en ligne, activer le mode Avion et relancer Agenda, Clientes et Bilan.
- [ ] Créer une donnée fictive hors ligne, fermer, relancer et vérifier sa persistance.
- [ ] Revenir en ligne sans perte de données.
- [ ] Pendant une mise à jour de test, conserver un formulaire non enregistré et vérifier que le brouillon subsiste quand le nouveau contrôleur prend la main, sans rechargement automatique immédiat.
- [ ] Vérifier que la nouvelle interface est bien celle du build attendu après fermeture et relance.

## 4. Anomalies de recette

Pour chaque défaut, consigner au minimum :

| Champ | Contenu |
|---|---|
| Identifiant | `IPHONE-01`, `IPHONE-02`, etc. |
| Étapes exactes |  |
| Résultat attendu |  |
| Résultat observé |  |
| Capture ou vidéo |  |
| Reproductible après relance |  |
| Risque pour les données ou le Bilan |  |
| Décision | corrigé · accepté · bloque le lancement |

Toute correction de code crée un nouveau commit, impose le numéro de version suivant et oblige à rejouer la suite automatisée ainsi que les scénarios manuels concernés.

## 5. Critère de clôture

La candidate 2026.15 est acceptée pour le lancement seulement lorsque le décompte automatisé final est vert, les Actions GitHub sont vertes, toutes les cases iPhone obligatoires sont réussies et aucune anomalie bloquante ne reste ouverte.
