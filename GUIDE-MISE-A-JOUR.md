# Mettre Mon agenda à jour vers la version 12.2 bêta

La version 12.2 adapte automatiquement les données existantes. Pour rester protégée en cas d’interruption ou de problème propre à l’iPhone, effectue néanmoins la sauvegarde ci-dessous avant de remplacer les fichiers.

## 1. Créer une sauvegarde avant la mise à jour

1. Sur l’iPhone, ouvre **Mon agenda → Réglages → Données et sauvegardes**.
2. Touche **Sauvegarder dans Fichiers**.
3. Dans la feuille de partage, choisis **Enregistrer dans Fichiers**, puis un dossier personnel facile à retrouver.
4. Vérifie que le fichier JSON apparaît bien dans ce dossier.

Ne place jamais ce fichier JSON sur GitHub : il contient tes données professionnelles.

## 2. Remplacer les fichiers sur le PC

1. Décompresse l’archive de la version 12.2.
2. Dans GitHub Desktop, sélectionne le dépôt `mon-agenda`, puis clique sur **Show in Explorer**.
3. Copie tous les fichiers de la version 12.2 dans ce dossier et accepte leur remplacement.
4. Supprime ces anciens fichiers s’ils sont encore présents :
   - `assistant.js`
   - `client-ui.js`
   - `clients.css`
   - `visual.js`
   - `visual.css`
   - `overrides.css`
5. Ne supprime pas le dossier caché `.git` et n’ajoute pas ta sauvegarde JSON au dépôt.

## 3. Vérifier et publier avec GitHub Desktop

1. Reviens dans GitHub Desktop.
2. Vérifie que les changements concernent uniquement les fichiers de l’application.
3. Vérifie qu’aucun fichier de sauvegarde `.json` ni export `.csv` personnel n’apparaît.
4. Dans **Summary**, écris `Version 12.2 beta`.
5. Clique sur **Commit to main**, puis sur **Push origin**.

## 4. Appliquer la mise à jour sur l’iPhone

1. Attends une à deux minutes après le Push.
2. Dans Safari, ouvre `https://bd87b9495f-blip.github.io/mon-agenda/?v=12.2`.
3. Accepte le bandeau **Nouvelle version disponible** lorsqu’il apparaît.
4. Ferme puis relance Mon agenda depuis l’écran d’accueil.
5. Ouvre **Réglages → À propos** et vérifie `Mon agenda · version 12.2 bêta`.

Ne désinstalle pas l’application et n’efface pas les données Safari pour actualiser le cache. Si l’ancienne version reste affichée, rouvre d’abord le lien ci-dessus dans Safari, laisse la page ouverte quelques secondes et relance l’application.

## 5. Ce que la migration conserve

- clientes, rendez-vous, tarifs, paiements, suppléments et historiques ;
- anciens repères clientes, avec leur symbole existant ;
- réglages et préférences ;
- anciens créneaux bloqués, convertis en événements personnels avec **Bloquer les rendez-vous clients** activé ;
- brouillons encore compatibles.

La migration ajoute aussi les catégories de dépenses proposées par défaut. Elle ne recalcule pas les anciens revenus et ne déduit aucune dépense du chiffre d’affaires. Une copie locale de sécurité des données précédentes est conservée avant l’adaptation.

## 6. Contrôles rapides après la mise à jour

1. Ouvre un ancien rendez-vous et vérifie la cliente, la prestation, le prix, les suppléments et le paiement.
2. Dans une fiche cliente, ajoute ou modifie un repère avec un emoji du clavier de l’iPhone.
3. Crée un **Événement personnel** sur une journée, puis vérifie qu’il apparaît dans le planning.
4. Crée un événement informatif avec **Bloquer les rendez-vous clients** désactivé et vérifie qu’il n’empêche pas l’ajout d’un rendez-vous.
5. Si tu avais un ancien créneau bloqué, vérifie qu’il apparaît comme événement personnel bloquant.
6. Ajoute une petite dépense d’essai et vérifie-la dans **Bilans → Dépenses**, sans modification du chiffre d’affaires.
7. Vérifie les vues Jour, Semaine et Mois, notamment l’affichage d’un événement personnel sur plusieurs jours.
8. Lance une nouvelle sauvegarde et choisis son emplacement dans l’application Fichiers.

## 7. En cas de problème

Conserve l’application installée et ne supprime pas ses données. Note l’action qui a provoqué le problème et, si possible, prends une capture d’écran. Le fichier créé à l’étape 1 pourra être réimporté depuis **Réglages → Données et sauvegardes → Restaurer une sauvegarde** après vérification de la version affichée.
