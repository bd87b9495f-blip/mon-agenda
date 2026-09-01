# Mettre Mon agenda à jour vers la version 12.5 bêta

La V12.5 migre automatiquement les données existantes vers une base locale plus fiable. La copie V12.4.1 reste intacte tant que la nouvelle base n’a pas été écrite puis vérifiée.

## 1. Sauvegarder avant la mise à jour

1. Sur l’iPhone, ouvre **Mon agenda → Réglages → Données et sauvegardes**.
2. Touche **Sauvegarder dans Fichiers**.
3. Choisis **Enregistrer dans Fichiers** puis un dossier personnel.
4. Vérifie que le fichier JSON est bien présent.

Ne place jamais ce fichier sur GitHub : il contient tes données professionnelles.

## 2. Remplacer les fichiers

1. Décompresse l’archive `mon-agenda-v12.5-beta.zip`.
2. Dans GitHub Desktop, ouvre le dépôt `mon-agenda` avec **Show in Explorer**.
3. Copie tous les fichiers du dossier `mon-agenda-v12.5-beta` dans le dépôt et accepte leur remplacement.
4. Vérifie impérativement que le nouveau fichier `storage.js` se trouve à côté de `app.js` et `index.html`.
5. Ne supprime pas le dossier caché `.git` et ne copie pas ta sauvegarde JSON dans le dépôt.

Si ces anciens fichiers sont encore présents, ils peuvent être supprimés : `assistant.js`, `client-ui.js`, `clients.css`, `visual.js`, `visual.css` et `overrides.css`.

## 3. Publier avec GitHub Desktop

1. Vérifie qu’aucun fichier JSON de sauvegarde ni export CSV personnel n’apparaît dans les changements.
2. Utilise le résumé `Version 12.5 beta`.
3. Clique sur **Commit to main**, puis sur **Push origin**.

## 4. Appliquer la mise à jour sur l’iPhone

1. Attends une à deux minutes après le Push.
2. Dans Safari, ouvre `https://bd87b9495f-blip.github.io/mon-agenda/?v=12.5`.
3. Laisse la page ouverte quelques secondes et accepte **Nouvelle version disponible** si le bandeau apparaît.
4. Ferme puis relance Mon agenda depuis l’écran d’accueil.
5. Ouvre **Réglages → À propos** et vérifie `Mon agenda · version 12.5 bêta`.

Ne désinstalle pas l’application et n’efface pas les données Safari pour forcer l’actualisation.

## 5. Contrôler la migration

1. Vérifie quelques anciens rendez-vous, clientes, paiements, événements et dépenses.
2. Ouvre **Réglages → Données et sauvegardes**.
3. Dans **Sécurité des données**, vérifie que **Base sécurisée active** est affiché.
4. Touche **Vérifier maintenant** : le contrôle doit confirmer le nombre de rendez-vous et de clientes.
5. Crée puis modifie un élément de test. Une première copie automatique doit ensuite être indiquée dans cette rubrique.
6. Supprime l’élément de test si nécessaire, puis réalise une nouvelle sauvegarde dans Fichiers.

## 6. Si un écran de récupération apparaît

- Ne désinstalle pas l’application.
- N’efface pas l’historique ni les données de Safari.
- Touche d’abord **Réessayer l’ouverture**.
- Si le problème persiste, utilise **Restaurer depuis Fichiers** avec la sauvegarde créée avant la mise à jour.
- **Créer un diagnostic technique** produit un fichier sans noms, coordonnées, adresses ni notes ; conserve-le pour l’analyse du problème.

Si l’application indique seulement **Stockage de compatibilité actif**, elle reste utilisable. Les modifications faites dans ce mode seront réintégrées automatiquement lorsque la base sécurisée redeviendra disponible.
