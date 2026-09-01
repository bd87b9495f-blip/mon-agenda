# Cahier des charges validé — Mon agenda V12.5 bêta

## 1. Périmètre de la version

- La V12.5 est consacrée à la fiabilité, la sécurité locale et la récupération des données.
- Les fonctions métier et l’interface validées en V12.4.1 sont conservées.
- La nouvelle vue « Aujourd’hui » et les fonctions supplémentaires de relation cliente ne font pas partie de cette version.
- Le schéma métier reste en données v14 afin d’éviter une migration fonctionnelle inutile.

## 2. Nouveau stockage principal

- IndexedDB devient le stockage principal.
- Clientes, rendez-vous, événements personnels et dépenses sont enregistrés comme entités séparées ; les réglages et métadonnées possèdent leurs espaces dédiés.
- Chaque modification utilise une transaction atomique : tout est enregistré ou rien ne l’est.
- Une révision empêche deux fenêtres ouvertes d’écraser silencieusement leurs modifications respectives.
- Le contenu est relu et contrôlé avant d’être accepté au démarrage.
- Le contrôle compare la structure, le nombre d’éléments et une empreinte déterministe de l’état complet.

## 3. Migration et compatibilité

- Les données V12.4.1 sont lues sans être supprimées.
- La migration vers IndexedDB n’est validée qu’après relecture et contrôle d’intégrité.
- En cas d’échec de migration ou d’indisponibilité d’IndexedDB, le stockage compatible reste actif si sa copie est exploitable.
- Les modifications réalisées temporairement dans ce mode sont réintégrées dans IndexedDB dès son retour.
- Une base IndexedDB valide reste prioritaire sur une ancienne copie compatible obsolète.
- Aucune base vide ne doit remplacer silencieusement des données détectées mais illisibles.

## 4. Copies automatiques et récupération

- Les cinq états précédant les dernières modifications sont conservés dans des copies automatiques tournantes.
- Chaque copie possède une date, un motif, des compteurs et une empreinte de contrôle.
- Une copie invalide est ignorée.
- Si la base principale est anormale, la copie automatique valide la plus récente est utilisée en priorité.
- À défaut, la copie compatible V12.4.1 peut être récupérée sans être supprimée.
- Si aucune source n’est fiable, l’agenda ne s’ouvre pas sur un état vide : un écran de récupération est affiché.
- Cet écran permet de réessayer, d’importer une sauvegarde JSON ou d’exporter un diagnostic technique.

## 5. Réglages et diagnostic

- **Réglages → Données et sauvegardes** indique le mode de stockage, le résultat du contrôle, le nombre de copies automatiques et l’espace local utilisé si disponible.
- Une vérification manuelle de la base peut être lancée.
- La dernière copie automatique peut être restaurée après confirmation ; l’état remplacé devient lui-même récupérable.
- Le diagnostic contient uniquement versions, étapes techniques, codes d’erreur, compteurs, quota et métadonnées de copies.
- Le diagnostic exclut clientes, noms, téléphones, adresses, notes et contenu des rendez-vous.

## 6. Démarrage et mise à jour

- L’interface métier reste inaccessible tant que la base n’est pas validée.
- Une erreur de chargement du module de stockage conduit au mode de récupération.
- Le service worker met en cache `storage.js` avec le reste de l’application pour le fonctionnement hors connexion.
- Une mise à jour en attente ne s’active pas lorsqu’un formulaire contient des changements non enregistrés.
- Le thème reste manuel, Clair par défaut, et indépendant du réglage de l’iPhone.

## 7. Fonctions antérieures à préserver

- Zoom Jour et Semaine autour des horaires de travail, étendu uniquement par un rendez-vous actif ou un événement horaire hors horaires.
- Aucun événement sur une ou plusieurs journées entières ne doit étendre la frise à 00:00–24:00.
- Bulle d’information en vue Mois avec programme du jour et ajout direct.
- Bilans par période, prestations et suppléments séparés, nombre lié au jour du rendez-vous et encaissement lié au jour du paiement.
- Recherche globale, dépenses séparées des revenus, exports CSV et sauvegardes JSON.
- Messages intégrés, brouillons, contrôles de conflits, accessibilité, affichage compact et thème manuel.

## 8. Qualité attendue

- Les 67 contrôles historiques sont conservés et complétés par des scénarios de migration, panne de quota, transaction interrompue, corruption, restauration, concurrence, compatibilité et confidentialité du diagnostic.
- Les fichiers de test et rapports ne sont pas inclus dans l’archive livrée.
- L’application reste autonome, sans bibliothèque distante, publicité, analyseur externe ni transmission de données métier.
