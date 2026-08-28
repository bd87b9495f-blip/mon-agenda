# Cahier des charges validé — Mon agenda v12.3 bêta

## 1. Planning Jour et Semaine

- La plage visible repose sur les horaires de travail configurés.
- Un rendez-vous client actif hors horaires agrandit exceptionnellement la plage.
- Un événement personnel horaire hors horaires agrandit exceptionnellement la plage, qu’il soit bloquant ou informatif.
- Un événement personnel sur une ou plusieurs journées entières reste dans le bandeau dédié et n’influence jamais la plage horaire.
- Le comportement est identique en vue Jour et en vue Semaine.

## 2. Analyse des prestations

- Le bilan peut être filtré sur une prestation ou afficher toutes les prestations.
- Pour chaque prestation, il affiche le nombre réalisé et le prix de base encaissé.
- Pour chaque nature de supplément, un tableau distinct affiche le nombre d’utilisations et le montant encaissé.
- Le nombre réalisé suit la date du rendez-vous.
- Le montant encaissé suit la date du paiement.
- Exemple attendu : un rendez-vous du 30 juin payé le 2 juillet compte une fois en juin avec 0 € encaissé ; en juillet, il compte zéro fois mais son paiement est encaissé.
- Les tableaux peuvent être triés par nombre ou par montant, et chaque ligne permet d’ouvrir les rendez-vous sources.

## 3. Sauvegarde et recherche

- L’icône de sauvegarde évoque un document enregistré dans l’application Fichiers.
- Une sauvegarde JSON peut être vérifiée sans restaurer ni modifier les données actives.
- Une recherche globale permet de retrouver un rendez-vous par cliente, téléphone, prestation, note, date ou statut.

## 4. Qualité attendue

- Le schéma de données v14 et les migrations existantes restent compatibles.
- Les 67 tests historiques sont conservés, puis complétés par des tests v12.3.
- L’application doit rester utilisable hors connexion, sans bibliothèque distante ni transmission des données métier.
- Les libellés, zones tactiles, contrastes et animations doivent rester adaptés à l’iPhone.
