# Mettre Mon agenda à jour vers la version 12.1.1 bêta

## 1. Sauvegarder avant la mise à jour

Sur l’iPhone, ouvre **Mon agenda → Réglages → Données et sauvegardes**, puis touche **Sauvegarder dans Fichiers**. Dans la feuille de partage, choisis **Enregistrer dans Fichiers** et sélectionne ton dossier personnel. Ne place jamais ce fichier JSON sur GitHub.

## 2. Remplacer les fichiers sur le PC

1. Décompresse l’archive de la version 12.1.1.
2. Dans GitHub Desktop, sélectionne le dépôt `mon-agenda` puis clique sur **Show in Explorer**.
3. Copie tous les fichiers de la version 12.1.1 dans ce dossier et accepte leur remplacement.
4. Supprime ces anciens fichiers s’ils sont encore présents :
   - `assistant.js`
   - `client-ui.js`
   - `clients.css`
   - `visual.js`
   - `visual.css`
   - `overrides.css`
5. Ne supprime pas le dossier caché `.git`.

## 3. Publier

1. Reviens dans GitHub Desktop.
2. Vérifie que les changements concernent uniquement les fichiers de l’application et qu’aucun fichier `.json` personnel n’apparaît.
3. Dans **Summary**, écris `Version 12.1.1 beta`.
4. Clique sur **Commit to main**, puis sur **Push origin**.

## 4. Actualiser l’iPhone

1. Attends une à deux minutes.
2. Dans Safari, ouvre `https://bd87b9495f-blip.github.io/mon-agenda/?v=12.1.1`.
3. Accepte le message de mise à jour s’il apparaît, puis ferme et relance l’application depuis l’écran d’accueil.
4. Ouvre **Réglages → À propos** et vérifie `Mon agenda · version 12.1.1 bêta`.

Les rendez-vous, clientes, tarifs, suppléments, repères, indisponibilités et réglages restent dans l’iPhone pendant la mise à jour. La version 12.1.1 adapte automatiquement les anciennes données et conserve une copie locale de sécurité avant la migration. Si nécessaire, utilise **Réglages → Données et sauvegardes → Restaurer une sauvegarde** pour récupérer le fichier JSON créé à l’étape 1.

## 5. Contrôles rapides après mise à jour

1. Ouvre un rendez-vous existant et vérifie que ses informations sont intactes.
2. Ouvre **Réglages → Suppléments** et vérifie le nouveau prix proposé.
3. Teste la vue **Semaine** et la page **Fin de journée**.
4. Lance une nouvelle sauvegarde et choisis son dossier dans l’application Fichiers.
5. Dans **+ → Ajouter une indisponibilité**, coche **Toute la journée** : vérifie que le jour de fin est facultatif et qu’une période apparaît sur chaque jour couvert.
