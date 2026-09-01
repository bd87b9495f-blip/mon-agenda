# Mon agenda — version 12.5 bêta

Application personnelle hors ligne pour organiser une activité de prothésiste ongulaire sur iPhone. Les données professionnelles restent dans le navigateur de l’appareil et ne sont pas envoyées à GitHub.

## Priorité de cette version

La V12.5 sécurise l’enregistrement des données sans modifier les fonctions métier validées de la V12.4.1.

- les clientes, rendez-vous, événements, dépenses et réglages sont désormais enregistrés dans une base IndexedDB structurée ;
- une modification est validée dans une transaction complète : en cas d’échec, la dernière version cohérente reste active ;
- l’application contrôle le nombre d’éléments et l’empreinte de la base avant de l’utiliser ;
- cinq copies automatiques tournantes sont conservées localement avant les dernières modifications ;
- une base principale anormale est récupérée depuis la copie automatique la plus récente, puis depuis l’ancienne copie compatible si nécessaire ;
- l’application attend la fin de la vérification des données avant d’afficher l’agenda ;
- un écran de récupération permet de réessayer, de restaurer un fichier JSON ou de créer un diagnostic technique ;
- le diagnostic ne contient ni noms, ni coordonnées, ni adresses, ni notes ;
- si IndexedDB devient temporairement indisponible, le mode compatible reste utilisable et ses changements sont réintégrés au retour de la base sécurisée ;
- l’ancien stockage V12.4.1 n’est pas supprimé pendant la migration.

La sauvegarde manuelle dans l’application Fichiers reste indispensable en cas de perte, réinitialisation ou remplacement de l’iPhone.

## Fonctions métier conservées

- vues Jour et Semaine centrées sur les horaires de travail ;
- agrandissement exceptionnel pour les rendez-vous actifs et événements personnels horaires hors horaires ;
- événements d’une ou plusieurs journées entières affichés séparément sans étendre la frise de 00:00 à 24:00 ;
- vue Mois avec bulle détaillant le programme du jour et ajout direct d’un rendez-vous ou d’un événement ;
- bilans Jour, Semaine, Mois et Année ;
- nombre de prestations rattaché à la date du rendez-vous et encaissement rattaché à la date réelle du paiement ;
- classements distincts des prestations et des suppléments, avec nombre, montant et accès aux rendez-vous sources ;
- suivi séparé des dépenses ;
- recherche globale des rendez-vous ;
- thème Clair par défaut ou Sombre choisi manuellement dans les réglages ;
- densité de planning confortable ou compacte ;
- sauvegarde JSON, vérification sans restauration et retour aux données précédentes après une restauration.

## Migration depuis une ancienne version

Au premier démarrage, la V12.5 suit cet ordre :

1. elle lit les données existantes sans les supprimer ;
2. elle les adapte au schéma de données actuel ;
3. elle les écrit dans la nouvelle base ;
4. elle relit la base et vérifie son intégrité ;
5. elle utilise la nouvelle base uniquement si tous les contrôles réussissent.

En cas d’échec, la copie d’origine reste disponible et l’application utilise le mode compatible ou affiche l’écran de récupération. Ne désinstalle pas l’application et n’efface pas les données Safari pour résoudre un problème de migration.

## Données et confidentialité

- GitHub Pages héberge uniquement les fichiers de l’application, jamais la base locale.
- Les copies automatiques restent sur l’iPhone ; elles ne remplacent pas un export dans Fichiers.
- Une sauvegarde JSON contient les données professionnelles : ne la dépose jamais dans un dépôt GitHub public.
- Waze reçoit une adresse uniquement quand le bouton d’itinéraire est utilisé.
- Aucune synchronisation entre appareils n’est réalisée.

## Mise à jour

Lis `GUIDE-MISE-A-JOUR.md`, envoie tous les fichiers — notamment le nouveau fichier `storage.js` — puis ouvre :

`https://bd87b9495f-blip.github.io/mon-agenda/?v=12.5`

Dans **Réglages → À propos**, la version affichée doit être `Mon agenda · version 12.5 bêta`.

## Fichiers de l’application

- `index.html` : interface ;
- `style.css` : affichage mobile ;
- `app.js` : fonctions métier ;
- `storage.js` : stockage sécurisé, migration, contrôles et récupération ;
- `sw.js` : fonctionnement hors connexion et mise à jour ;
- `manifest.webmanifest` et icônes : installation sur l’iPhone.
