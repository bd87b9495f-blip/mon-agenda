# Mettre à jour vers Mon agenda Atelier

Cette archive est une candidate 2026.15 Atelier, build 2026.15.2, données v16. Les fichiers sont prêts à être testés et publiés sur le même hébergement que l’application ; aucun déploiement n’est effectué par la livraison du ZIP.

## Préserver les données avant la mise à jour

1. Dans l’ancienne application, ouvrir Réglages → Données et sauvegardes.
2. Sauvegarder dans Fichiers, puis vérifier le JSON. Conserver cette sauvegarde v15 et l’archive de l’ancienne application.
3. Noter les compteurs et quelques montants de référence : clientes, rendez-vous, événements, dépenses, encaissements et remboursements.
4. Fermer les autres onglets et instances de Mon agenda. Ne pas désinstaller la PWA et ne pas effacer les données de Safari.

## Préparer les fichiers

1. Décompresser le ZIP ; le dossier de l’application contient directement index.html, app.js, storage.js, style.css, sw.js, le manifeste et les icônes.
2. Copier son contenu à la racine du dépôt existant. Conserver le dossier .git et les paramètres du dépôt.
3. Ne copier aucune sauvegarde JSON métier ni export CSV personnel dans le dépôt.
4. Exécuter `node --test tests/*.test.mjs` et vérifier l’absence d’échec.
5. Vérifier le compteur réel des commits avant de nommer la publication. Le numéro visible 2026.15 est ici le repère historique, pas l’affirmation d’un nouveau compteur. Si la convention impose un nouveau numéro, mettre à jour APP_VERSION et BUILD_ID dans app.js, BUILD_ID dans sw.js, les liens versionnés index.html, le start_url du manifeste, package.json et le contrôle de version dans tests/release.test.mjs, puis rejouer les tests.
6. Publier le contenu sur le même chemin HTTPS que l’application existante ; attendre la réussite des contrôles et du déploiement.

## Ouvrir la mise à jour

Relancer une seule instance de Mon agenda avec Internet. Pour ce build, le paramètre de rafraîchissement est `?v=2026.15.2`. Vérifier le build et les données v16 dans Réglages → À propos. Une première ouverture en ligne est nécessaire pour installer le nouveau cache ; la PWA reste ensuite utilisable hors ligne.

Si un formulaire contient des modifications, terminer ou conserver sa saisie avant le rechargement. Si l’application demande de fermer les autres fenêtres, fermer uniquement les instances de Mon agenda et réessayer.

## Contrôler la migration

La liste de tâches est initialement vide. Comparer les compteurs et montants notés, les historiques et les catégories. Vérifier le stockage dans Réglages. Créer une tâche, fermer puis rouvrir ; la tâche doit rester présente. Exporter une sauvegarde v16, la vérifier et conserver le fichier.

Effectuer les scénarios de `TESTS-ATELIER.md` sur des données fictives dans un environnement de recette. Les suggestions de créneaux ne doivent pas empêcher de choisir manuellement un autre horaire ; le contrôle de chevauchement final reste actif.

## Récupération et retour arrière

En cas de problème, conserver l’état local et la sauvegarde récente. Réessayer l’ouverture, puis utiliser le diagnostic et les parcours de récupération prévus. Une restauration vérifiée conserve une copie de sécurité et reste annulable selon les protections existantes.

Ne pas remettre simplement l’ancien code par-dessus une base v16. L’ancienne application ne connaît pas les tâches ni ce schéma. Le retour aux données d’avant migration est un retour des données dans la version courante ; il ne rend pas l’ancien code compatible. Un retour de logiciel exige une sauvegarde compatible, une procédure testée et la conservation des données récentes. Ne jamais effacer Safari ou désinstaller pour forcer la mise à jour.
