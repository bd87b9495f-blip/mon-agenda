# Cahier des charges validé — Mon agenda v12.4 bêta

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

## 4. Vue Mois

- Un appui sur un jour ouvre une grande bulle d’information sans remplacer la vue Mois.
- La bulle affiche la date complète, les événements de journée entière en premier, puis les rendez-vous et événements horaires par ordre chronologique.
- Chaque élément peut être ouvert pour modification.
- Deux actions permettent d’ajouter un rendez-vous ou un événement personnel avec la date préremplie.
- Après une création, une modification ou une annulation de saisie, la bulle revient avec son contenu actualisé.
- La bulle possède un état vide, un défilement interne, une fermeture explicite et une fermeture par appui hors de la carte.

## 5. Interface et ergonomie

- L’iconographie, les espacements, les couleurs d’état et les actions principales sont harmonisés.
- Le formulaire de rendez-vous présente l’essentiel en premier et regroupe les champs avancés dans une zone dépliable.
- Les messages d’information et d’erreur sont intégrés visuellement à l’application.
- Le Bilan propose des raccourcis formulés comme des questions métier.
- Une densité confortable ou compacte peut être choisie pour les vues Jour et Semaine.
- Le mode sombre suit automatiquement le réglage de l’iPhone.
- Les nouveautés peuvent être expliquées une fois par un guide discret et non bloquant.

## 6. Qualité attendue

- Le schéma de données v14 et les migrations existantes restent compatibles.
- Les 67 tests historiques sont conservés, puis complétés par des tests v12.4.
- L’application doit rester utilisable hors connexion, sans bibliothèque distante ni transmission des données métier.
- Les libellés, zones tactiles, contrastes et animations doivent rester adaptés à l’iPhone.
