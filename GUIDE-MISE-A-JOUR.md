# Mettre Mon agenda à jour vers la version 12.0 bêta

## 1. Sauvegarder avant la mise à jour

Sur l’iPhone, ouvre **Mon agenda → Réglages → Données et sauvegardes**, puis touche **Sauvegarder dans Fichiers**. Garde le fichier JSON dans tes fichiers personnels et ne l’envoie pas sur GitHub.

## 2. Remplacer les fichiers sur le PC

1. Décompresse l’archive de la version 12.
2. Dans GitHub Desktop, sélectionne le dépôt `mon-agenda` puis clique sur **Show in Explorer**.
3. Copie tous les fichiers de la version 12 dans ce dossier et accepte leur remplacement.
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
3. Dans **Summary**, écris `Version 12.0 beta`.
4. Clique sur **Commit to main**, puis sur **Push origin**.

## 4. Actualiser l’iPhone

1. Attends une à deux minutes.
2. Dans Safari, ouvre `https://bd87b9495f-blip.github.io/mon-agenda/?v=12`.
3. Accepte le message de mise à jour s’il apparaît, puis ferme et relance l’application depuis l’écran d’accueil.
4. Ouvre **Réglages → À propos** et vérifie `Mon agenda · version 12.0 bêta`.

Les rendez-vous et réglages restent dans l’iPhone pendant la mise à jour. Si nécessaire, utilise **Réglages → Données et sauvegardes → Restaurer une sauvegarde** pour récupérer le fichier JSON créé à l’étape 1.
