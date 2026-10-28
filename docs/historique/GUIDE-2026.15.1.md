# Mettre Mon agenda à jour de la v12.5 bêta vers 2026.15

La 2026.15 est une candidate avant lancement. La suite automatisée doit être verte et la recette sur un vrai iPhone doit encore être exécutée avant de la déclarer stable.

## État de validation

- **Automatisé** : exécuter `node --test tests/*.test.mjs` ; le résultat de la livraison figure dans `TESTS-2026.15.md`.
- **iPhone réel** : non effectué à ce stade ; compléter la checklist de ce guide et consigner les résultats dans `TESTS-2026.15.md`.

## 1. Sauvegarder la v12.5 avant toute mise à jour

- [ ] Ouvrir **Mon agenda → Réglages → Données et sauvegardes** sur l’iPhone qui contient les données de test.
- [ ] Toucher **Sauvegarder dans Fichiers** et enregistrer le JSON dans un dossier personnel.
- [ ] Utiliser **Vérifier une sauvegarde** sur ce même fichier.
- [ ] Noter les nombres de clientes, rendez-vous, événements personnels et dépenses.
- [ ] Garder une copie intacte du dossier ou de l’archive v12.5.

La sauvegarde JSON contient les données professionnelles ou de test. Ne jamais la copier dans GitHub, l’archive publique ou un dossier partagé publiquement.

## 2. Préparer la candidate 2026.15

1. Décompresser `mon-agenda-2026.15-corrigee.zip`.
2. Dans GitHub Desktop, ouvrir le dépôt `mon-agenda` avec **Show in Explorer**.
3. Copier tout le contenu du dossier `mon-agenda-2026.15-corrigee` dans le dépôt et accepter le remplacement des fichiers.
4. Vérifier que `index.html`, `style.css`, `app.js`, `storage.js`, `sw.js`, `icon.svg`, `icon-180.png`, `icon-192.png` et `icon-512.png` sont à la racine, et que `tests/` est présent.
5. Ne pas supprimer le dossier caché `.git`.
6. Vérifier qu’aucun JSON de sauvegarde ni CSV métier n’a été copié dans le dépôt.

Les anciens fichiers supprimés dans cette livraison ne doivent pas être réintroduits : `assistant.js`, `client-ui.js`, `clients.css`, `visual.js`, `visual.css` et `overrides.css`.

## 3. Exécuter les contrôles automatisés

Depuis le dossier du projet, avec Node.js installé :

```bash
node --test tests/*.test.mjs
```

- [ ] La commande termine sans échec.
- [ ] Le nombre final de tests réussis est reporté dans `TESTS-2026.15.md` après le gel de l’archive.
- [ ] `Mon agenda · version 2026.15`, le build `2026.15.1` et le schéma `v15` sont cohérents dans les contrôles.

## 4. Créer le quinzième commit et publier

1. Dans GitHub Desktop, vérifier une dernière fois qu’aucun fichier personnel n’apparaît dans les changements.
2. Utiliser le résumé `Version 2026.15`.
3. Cliquer sur **Commit to main**, puis sur **Push origin**.
4. Dans la page **Actions** du dépôt, attendre que **Contrôles de qualité** et le déploiement **GitHub Pages** soient tous les deux terminés avec succès.

Cette règle suppose que le dépôt possède quatorze commits avant cette publication. Si GitHub indique déjà un autre total, arrêter la publication et aligner le numéro visible sur le vrai compteur. Toute correction de code nécessitant un nouveau commit doit recevoir le numéro suivant ; il ne faut pas republier un code différent sous le même `2026.15`.

Le build `2026.15.1` distingue cette archive corrigée de la première candidate `2026.15.0`, avant le quinzième commit. Si cette première candidate a déjà été commitée, adapter le numéro visible et le build avant publication.

## 5. Déclencher la mise à jour sur l’iPhone

1. Fermer toutes les autres fenêtres et tous les autres onglets Safari ouverts sur Mon agenda, puis fermer complètement toutes les instances de la PWA lancées depuis l’écran d’accueil.
2. Relancer une seule instance avec Internet, dans Safari, puis ouvrir :

   `https://bd87b9495f-blip.github.io/mon-agenda/?v=2026.15.1`

3. Accepter **Nouvelle version disponible** si le message apparaît.
4. Fermer puis relancer Mon agenda depuis l’écran d’accueil.
5. Ouvrir **Réglages → À propos** et vérifier `Mon agenda · version 2026.15` ainsi que `données v15`.

L’ancien onglet ou l’ancienne instance ne doit pas rester actif pendant la migration. Ne pas désinstaller la PWA et ne pas effacer l’historique ou les données de Safari pour forcer la mise à jour.

Si une autre fenêtre est encore détectée, Mon agenda affiche **Ferme les autres fenêtres** et n’ouvre aucune donnée. Fermer les autres instances puis toucher **Réessayer**.

Les onglets d’autres projets hébergés sur le même site GitHub Pages peuvent rester ouverts : seules les fenêtres dans le périmètre de Mon agenda sont comptées.

## 6. Valider la migration v12.5 → 2026.15

Au premier démarrage, l’application contrôle l’ancien état avant sa conversion au schéma v15. Une copie locale d’avant migration est conservée lorsqu’un ancien état exploitable est effectivement converti.

- [ ] La base s’ouvre sans écran de récupération inattendu.
- [ ] **Réglages → Données et sauvegardes** affiche **Base sécurisée active**.
- [ ] Si IndexedDB est indisponible, illisible ou si les sources sont ambiguës, l’écran de récupération apparaît et aucune création, modification ni écriture du miroir n’est possible.
- [ ] **Vérifier maintenant** réussit.
- [ ] Les nombres de clientes, rendez-vous, événements et dépenses correspondent aux nombres notés avant migration.
- [ ] Plusieurs anciennes fiches clientes, anciens rendez-vous, événements, catégories historiques et dépenses sont intacts.
- [ ] Les statuts, dates, tarifs, suppléments, paiements et moyens de paiement de plusieurs rendez-vous sont cohérents.
- [ ] Si un ancien paiement possédait une date future erronée, sa date a été ramenée au jour de migration et l’historique du rendez-vous porte la correction.
- [ ] Si un ancien paiement **À régler** ne possédait pas de date de relance, il a reçu la date de migration et une trace d’historique.
- [ ] **Récupérer les données d’avant la mise à jour** est proposé lorsqu’une copie d’avant migration a effectivement été créée ; ne l’utiliser que pour le scénario de retour contrôlé décrit plus bas.
- [ ] Après fermeture complète et relance, les données migrées sont toujours présentes.
- [ ] Lors d’un contrôle effectué un autre jour, les dates corrigées et leur historique restent identiques ; si un ancien miroir subsiste, seule sa version exactement attestée est reconnue.

## 7. Recette métier manuelle sur iPhone

Utiliser uniquement des données fictives et noter chaque résultat dans `TESTS-2026.15.md`.

### Agenda et clientes

- [ ] Créer, modifier, déplacer puis supprimer un rendez-vous de test.
- [ ] Effectuer plusieurs enregistrements rapides successifs ; aucun doublon ne doit apparaître et le dernier état enregistré doit rester visible après relance.
- [ ] Créer deux fiches portant exactement le même nom mais avec des téléphones différents.
- [ ] Saisir un nouveau rendez-vous avec ce nom : le dialogue doit proposer toutes les fiches homonymes et enregistrer celle qui a été choisie.
- [ ] Tester une annulation et une absence sans perte de l’historique.

### Paiements et Bilan

- [ ] Créer un rendez-vous terminé avec un montant fictif et le marquer **Payé** à une date différente de celle du rendez-vous.
- [ ] Tenter de marquer **Payé** un rendez-vous sans tarif : l’enregistrement doit être refusé. Un tarif explicitement saisi à `0` doit rester possible pour une prestation offerte.
- [ ] Vérifier le brut au jour, à la semaine, au mois et à l’année de la date de paiement.
- [ ] Vérifier que la fin de journée affiche **✓ Payé aujourd’hui** pour un rendez-vous non payé, puis **✓ Payé** après enregistrement sans déplacer la date d’un paiement déjà saisi.
- [ ] Tenter une date de paiement future : l’enregistrement doit être refusé.
- [ ] Avec un rendez-vous payé, tenter de modifier directement la prestation, le prix ou les suppléments : le verrou doit refuser la modification.
- [ ] Suivre la procédure documentée pour corriger le montant, puis réenregistrer le paiement.
- [ ] Annuler ou marquer absent un rendez-vous payé : l’encaissement doit rester dans le Bilan.
- [ ] Tenter de supprimer un rendez-vous payé, puis un rendez-vous remboursé : la suppression doit être refusée et les mouvements financiers conservés.
- [ ] Passer ce paiement à **Remboursé** avec une date postérieure au paiement ; vérifier le brut à la date du paiement, le remboursement à sa date et le net des deux périodes.
- [ ] Tenter un remboursement antérieur au paiement ou futur : l’enregistrement doit être refusé.
- [ ] Placer un autre rendez-vous en **À régler** avec une date de relance, puis l’annuler : il doit rester visible dans les rappels, la fiche cliente, le Bilan et le CSV.
- [ ] Vérifier qu’un rendez-vous futur en **À vérifier** n’est pas présenté comme paiement à contrôler.
- [ ] Exporter chaque rubrique du Bilan et vérifier dans Numbers que les montants calculés sont des nombres et correspondent à l’écran.

### Sauvegarde et retour arrière

- [ ] Créer et vérifier une nouvelle sauvegarde JSON de la 2026.15.
- [ ] Ajouter ensuite un rendez-vous fictif nommé clairement `APRÈS SAUVEGARDE`.
- [ ] Restaurer le JSON vérifié et confirmer que ce rendez-vous ajouté après la sauvegarde n’est plus présent.
- [ ] Toucher **Revenir aux données d’avant la restauration** et confirmer que `APRÈS SAUVEGARDE` réapparaît.
- [ ] Vérifier de nouveau la base après le retour arrière.

Ce scénario doit être fait avec des données de recette et une sauvegarde vérifiée. Ne pas expérimenter une restauration pour la première fois sur l’unique copie de données réelles.

## 8. Recette PWA et interface sur iPhone

- [ ] Tester la page dans Safari, puis la PWA lancée depuis l’écran d’accueil.
- [ ] Après une première ouverture en ligne, fermer l’application, activer le mode Avion et relancer Agenda, Clientes et Bilan.
- [ ] Hors ligne, créer un élément fictif, fermer complètement l’application, la relancer et vérifier sa présence.
- [ ] Revenir en ligne et vérifier qu’aucune donnée n’a disparu.
- [ ] Ouvrir un autre projet GitHub Pages du même compte : il ne doit pas bloquer Mon agenda. Une deuxième fenêtre de Mon agenda doit toujours déclencher **Ferme les autres fenêtres** au démarrage ou à la mise à jour.
- [ ] Laisser un formulaire modifié mais non enregistré pendant la prise de contrôle d’une mise à jour de test : le brouillon doit rester disponible et le rechargement automatique doit être différé.
- [ ] Tester les thèmes Clair et Sombre, les orientations utiles, les boutons tactiles de la grille et les dialogues.
- [ ] Activer VoiceOver pour vérifier les boutons principaux, les noms des dialogues, les champs de fichiers et les messages d’erreur essentiels.

## 9. Si un écran de récupération apparaît

- Ne pas désinstaller l’application.
- Ne pas effacer l’historique ni les données de Safari.
- Toucher d’abord **Réessayer l’ouverture**.
- Si le problème persiste, créer et conserver un diagnostic technique.
- Restaurer une sauvegarde vérifiée seulement après avoir identifié qu’aucune base exploitable ne peut être ouverte.

Il n’existe aucun mode local de compatibilité inscriptible : le miroir sert uniquement de preuve, de diagnostic ou de candidate de récupération. Une source vide, ancienne ou ambiguë ne doit jamais être appliquée automatiquement à la place d’une base potentiellement plus récente, et l’écran de récupération ne doit effectuer aucune écriture avant une restauration explicitement confirmée. Une ouverture ou une relecture IndexedDB qui ne répond pas finit volontairement sur cet écran au lieu de laisser l’application figée ; réessayer ne rejoue pas une création ou une migration déjà validée.

## 10. Décision de lancement et correction d’un problème

La 2026.15 peut devenir la version de lancement uniquement si :

- la suite automatisée finale est entièrement verte ;
- les deux Actions GitHub sont vertes ;
- toutes les cases manuelles iPhone sont réussies et documentées ;
- aucun défaut connu ne risque une perte de données, une incohérence financière ou un blocage au démarrage.

Si un problème apparaît après publication, conserver les données et publier une correction qui reste compatible avec le schéma v15. Exporter et vérifier une sauvegarde récente dès que l’application le permet.

**Ne pas republier directement la v12.5 par un Revert Git.** Elle utilise la même base locale, mais son ancien contrôle de données peut rejeter l’état v15 et restaurer une copie plus ancienne. Les saisies effectuées depuis la mise à jour risqueraient alors de disparaître.

Un retour exceptionnel vers une ancienne version exige une sauvegarde explicitement compatible avec cette version et une procédure de restauration préalablement testée dans un environnement séparé. Conserver aussi la sauvegarde récente v15 et identifier les saisies à reprendre après la date de l’ancienne copie. Le bouton **Récupérer les données d’avant la mise à jour** concerne les données ; il ne rend pas les anciens fichiers de l’application compatibles avec la base actuelle.

Ne pas désinstaller la PWA ni effacer les données Safari pour tenter de revenir en arrière.

Après une recette complète réussie, créer une nouvelle sauvegarde dans Fichiers. Si une correction de code est nécessaire, elle doit être retestée et publiée sous le prochain numéro de commit.
