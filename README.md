# Mon agenda — application personnelle hors ligne

Petite PWA pour gérer des rendez-vous de prothésiste ongulaire : calendrier semaine, clientes, adresse, prestation, prix et notes. Les données restent dans le navigateur de l'iPhone et l'application fonctionne hors connexion après sa première ouverture.

## Publication gratuite avec GitHub Pages

1. Sur GitHub, crée un dépôt **public** nommé par exemple `mon-agenda`.
2. Envoie tous les fichiers de ce dossier dans ce dépôt.
3. Ouvre **Settings** → **Pages** → *Deploy from a branch* → sélectionne `main` et le dossier `/ (root)` → **Save**.
4. Attends une minute, puis ouvre l'adresse affichée par GitHub sur l'iPhone.
5. Dans Safari : bouton Partager → **Sur l'écran d'accueil** → **Ajouter**.

Ouvre l'application une fois avec une connexion, puis elle reste utilisable sans réseau. Fais régulièrement une sauvegarde avec l'icône ⇩ dans l'application : elle télécharge un fichier JSON dans Fichiers.

## Limites assumées

Les rendez-vous sont stockés localement, sur cet iPhone. GitHub Pages ne connaît ni ne conserve les données clientes. Les alertes même quand l'app est fermée nécessitent le Calendrier iPhone ou une app native ; cette première version ne les envoie pas.
