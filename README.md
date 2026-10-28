# Mon agenda Atelier

Refonte de l’application personnelle de prothésiste ongulaire, en HTML, CSS et JavaScript, utilisable hors ligne sur iPhone. Cette archive conserve les fonctions et protections de la base 2026.15 corrigée et intègre la direction visuelle B — Atelier.

| Repère | Livraison |
|---|---|
| Version visible | 2026.15 |
| Build et cache PWA | 2026.15.2 |
| Schéma métier | v16 |
| Base IndexedDB | version technique 3 |
| Format de sauvegarde JSON | v4 |
| Statut | candidate Atelier, recette iPhone restante |

Le numéro visible historique est conservé faute d’accès au compteur réel du dépôt. Le build distinct identifie cette livraison. Avant un nouveau commit publié, aligner la version visible et le build sur la convention année.nombre-de-commits effectivement appliquée au dépôt. Aucun commit ni déploiement n’a été effectué pour cette archive.

## Ce qui change

- Agenda Jour conservé à l’ouverture, à la date du jour. Les vues Semaine et Mois restent disponibles avec leur grille et leur programme de journée.
- Présentation Atelier : surfaces sobres, couleurs prune et ivoire, hiérarchie plus courte, outils de journée regroupés et commandes nommées.
- « À suivre » rassemble les relances, les rendez-vous à confirmer, les journées non clôturées et les rappels de sauvegarde. Leur portée reste globale, même quand une autre date est consultée.
- « Journée » donne accès au résumé détaillé, au prochain rendez-vous, à Fin de journée et à Ma tournée.
- « Ajouter » propose rendez-vous, événement personnel, dépense et tâche.
- « Mes tâches » : ajout, modification, date facultative, réalisation, rétablissement et suppression. Les tâches sont distinctes du suivi automatique.
- Le rendez-vous se crée normalement : cliente, prestation, durée, tarif, date et heure libres. Les suggestions de créneaux sont une aide facultative ; elles ne réservent rien et leur application exige un choix explicite.
- Une dépense peut être dupliquée dans un nouveau formulaire : date et montant restent à vérifier, aucune écriture n’a lieu avant validation.
- Le mode discrétion masque les montants affichés. Les calculs, les sauvegardes et les exports conservent les valeurs réelles. Ce mode n’est ni un chiffrement ni un contrôle d’accès.
- Les thèmes Clair / Sombre restent manuels, indépendants de l’iPhone ; les densités Confortable / Compact restent disponibles.

Aucun justificatif de dépense, suivi de matériel, compte utilisateur, serveur métier, synchronisation cloud ni nouvelle fonction de relation cliente n’est ajouté.

## Données et règles conservées

IndexedDB reste l’unique stockage métier inscriptible. Les tâches utilisent la même chaîne d’écriture, les mêmes contrôles et les mêmes sauvegardes que les autres données. La migration v15 vers v16 ajoute une liste de tâches vide ; elle ne recalcule pas les opérations financières déjà validées. Les anciennes clés locales de brouillons et de récupération sont conservées pour la continuité, même lorsque le contenu métier est désormais en v16.

Le stockage garde les transactions, contrôles d’intégrité, révisions, conflits entre fenêtres, copies automatiques, provenance des migrations, quarantaine, restauration et retour arrière. Une source ambiguë ou une base indisponible bloque les écritures. Aucun repli métier vers localStorage n’est introduit.

Les quatre états de paiement restent À vérifier, À régler, Payé et Remboursé. Les prestations suivent la date et la fin du rendez-vous actif ; les encaissements suivent leur date réelle ; les remboursements intégraux suivent leur propre date. Le net encaissé vaut brut moins remboursements, sans soustraire les dépenses. Une annulation ou une absence ne supprime aucun flux enregistré. Une date de relance est obligatoire pour À régler. Prix absent et zéro explicite restent distincts. Le verrou financier et les restrictions de suppression demeurent.

Les homonymes restent des fiches distinctes, avec identifiants propres. Les catégories de dépenses historiques, l’historique complet, les suppléments, les événements personnels multi-jours et les brouillons sont conservés.

## Vérification et installation

Exécuter depuis ce dossier :

```bash
node --test tests/*.test.mjs
```

La suite livrée réussit **184 / 184 tests** (154 historiques conservés et 30 nouveaux). Le résultat, les limites des contrôles et la recette restante figurent dans `TESTS-ATELIER.md`, avec le journal `VALIDATION-NODE.txt`. Le détail des accès se trouve dans `CORRESPONDANCE-FONCTIONS-ATELIER.md`. Suivre `GUIDE-MISE-A-JOUR.md` pour mettre à jour sans effacer les données.

L’application conserve le service worker versionné. Une mise à jour ne doit pas recharger un formulaire modifié ; les autres fenêtres de Mon agenda doivent être fermées avant migration. Les autres sites Safari ne sont pas concernés.

Le fonctionnement réel dans Safari, la PWA installée, le clavier, VoiceOver, le partage Fichiers et le cycle de mise à jour doivent encore être validés sur un véritable iPhone. Les tests Node ne constituent pas cette validation.

Les documents `CAHIER-DES-CHARGES-2026.15.md`, `TESTS-2026.15.md` et `docs/historique/` décrivent la livraison de départ. Les documents Atelier décrivent les changements de cette candidate.
