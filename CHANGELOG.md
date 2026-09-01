# Journal des versions

Ce journal décrit les changements visibles et les corrections de fiabilité. La version publique suit `année.nombre total de commits` ; un troisième nombre identifie le build technique utilisé par la PWA.

## 2026.15 — candidate avant lancement

Version visible `2026.15` · build `2026.15.0` · données `v15` · sauvegarde JSON format `v4`.

### Ajouts

- Bilan réorganisé par Jour, Semaine, Mois ou Année, avec onglets Prestations, Encaissements et Dépenses.
- Distinction financière entre encaissement brut, remboursement intégral et net.
- Date réelle de remboursement conservée séparément de la date du paiement.
- Détail des prestations et suppléments, vue annuelle par mois et exports CSV adaptés à la rubrique affichée.
- Choix explicite entre plusieurs fiches clientes homonymes.
- Thèmes Clair et Sombre, améliorations de contraste, de focus, de dialogues et de cibles tactiles.
- Base IndexedDB contrôlée, révisions, empreintes, compteurs, jusqu’à cinq copies automatiques, récupération et diagnostics sans données personnelles.
- Suite automatisée couvrant livraison, règles métier, stockage, migrations, PWA et accessibilité structurelle.
- Workflow GitHub **Contrôles de qualité** exécuté à chaque push et pull request.

### Modifications

- Adoption de la convention de version `année.nombre total de commits` ; la v12.5 bêta devient la base de migration vers 2026.15.
- Le schéma de données passe à `v15` avec contrôle de l’état source et copie locale avant migration.
- Les prestations réalisées suivent la date du rendez-vous ; le brut suit la date du paiement ; le remboursement suit sa propre date.
- Les montants calculés du CSV restent numériques pour être totalisés dans Numbers, Excel ou Sheets.
- Les catégories de dépenses historiques sont conservées même lorsqu’elles ne sont plus actives.
- Le cache PWA est isolé par build, installé avec revalidation réseau et nettoyé lors de l’activation d’une nouvelle livraison.
- Lors d’une prise de contrôle PWA, un brouillon non enregistré est conservé et le rechargement automatique est différé.
- Avant toute ouverture des données, la PWA vérifie qu’elle est le build courant et qu’exactement une fenêtre de Mon agenda est active ; sinon elle bloque la migration et demande de fermer les autres instances.

### Corrections métier

- Un paiement ou remboursement réel reste dans les flux même si le rendez-vous est ensuite annulé ou marqué absent.
- Un paiement **À régler** reste visible dans les rappels, la fiche cliente, le Bilan et le CSV après annulation ou absence.
- Les futurs rendez-vous **À vérifier** sont exclus des contrôles avant la fin de leur créneau.
- Les dates futures de paiement et de remboursement sont refusées ; un remboursement antérieur au paiement est également refusé.
- Une date de paiement future héritée d’une ancienne version est corrigée au jour de migration avec une trace dans l’historique.
- Un ancien paiement **À régler** sans date de relance reçoit la date de migration et une trace d’historique ; cette date ancrée rend les reprises et retours arrière déterministes.
- Un état v15 déjà validé reste lisible après un recul de l’horloge, tandis qu’une nouvelle saisie ou un import contenant une date financière future reste refusé.
- Le bouton de fin de journée indique **✓ Payé aujourd’hui** pour un nouveau paiement et **✓ Payé** pour un paiement existant, dont il conserve la date.
- La prestation, le prix de base et les suppléments sont figés après paiement ou remboursement afin de préserver les bilans historiques.
- Toutes les fiches portant le même nom sont proposées au lieu de sélectionner silencieusement la première.

### Corrections de stockage

- Les écritures rapides sont ordonnées et une sauvegarde échouée restaure l’état affiché puis rafraîchit les dialogues ouverts.
- Deux fenêtres ne peuvent plus écraser silencieusement la même révision.
- Une copie locale ancienne ou divergente ne remplace plus automatiquement la base principale.
- Une base contenant des entités mais privée de métadonnées est bloquée et préservée au lieu d’être prise pour une installation neuve.
- Un état remplacé pendant une récupération est placé en quarantaine lorsque cela est possible.
- IndexedDB est l’unique stockage métier inscriptible ; le miroir local sert seulement de preuve de provenance, de diagnostic ou de candidate de récupération, jamais de mode de repli.
- Si IndexedDB est absent, ne s’ouvre pas, ou si une lecture ou une provenance est ambiguë, l’application affiche l’écran de récupération et n’écrit aucune donnée ni aucun miroir.
- Une ancienne branche `legacy-fallback` n’est migrée qu’au retour d’IndexedDB et lorsque sa filiation exacte avec la base est démontrée.
- Un échec du tout premier commit laisse une base réessayable ; un quota insuffisant pour une copie automatique n’annule plus le commit métier réussi.
- Une restauration ou une écriture exigeant une copie de sécurité est refusée sans mutation si cette copie ne peut pas être créée.
- Une récupération manuelle refuse toute combinaison ambiguë entre la base, le miroir et la sauvegarde choisie, sans modifier aucune source.
- Les copies de retour arrière portent un identifiant atomique lié à leur restauration ; une copie illisible, historique ou devenue obsolète ne peut pas être substituée silencieusement.
- Un journal de restauration est écrit avant le commit puis promu après celui-ci : une interruption conserve toujours la copie de retour liée à l’état réellement actif.
- Les imports, retours à une copie automatique et annulations de restauration sont exclusifs ; une seconde opération ou une écriture ordinaire concurrente est refusée et remise au dernier état commis.
- Les ouvertures et lectures de démarrage sont bornées, y compris les vérifications après création ou migration ; un nouvel essai ne rejoue pas un commit déjà réussi.
- Une révision de métadonnée corrompue bloque le démarrage et la récupération confirmée repart sur une nouvelle lignée seulement après un contrôle atomique de la source.
- Les sauvegardes historiques déclarant des versions non entières ou contradictoires sont refusées avant migration afin de préserver les champs financiers récents.
- Les snapshots historiques couvrent l’état brut et leur contexte de migration ; altérer seulement la date les invalide.
- La provenance exacte d’une migration ou d’une récupération survit aux commits suivants et à la rotation des snapshots. Un ancien miroir non réécrit n’est accepté que s’il correspond exactement à la source attestée ; toute variante reste bloquante.
- Une récupération confirmée peut départager deux branches lorsque le fichier choisi correspond exactement à l’une d’elles ; trois états réellement divergents restent refusés sans écriture.
- Un état v15 ne peut pas contourner l’intégrité en supprimant, rétrogradant ou contredisant son enveloppe de sauvegarde v4.

### Validation

- La suite automatisée finale réussit `131 / 131` tests, sans échec.
- La validation sur un vrai iPhone n’a pas encore été effectuée. La version reste candidate tant que la checklist de `TESTS-2026.15.md` n’est pas entièrement réussie et consignée.

## v12.5 bêta — base précédente

Dernière archive utilisée comme point de départ. Ses données de test sont prises en charge par la migration 2026.15 ; elle doit être conservée avec une sauvegarde JSON vérifiée jusqu’à la fin de la recette iPhone.
