# Mon agenda — version 12.0 bêta

Application personnelle et gratuite pour organiser les rendez-vous d’une prothésiste ongulaire. Elle s’installe sur l’écran d’accueil de l’iPhone, fonctionne hors connexion après une première ouverture en ligne et conserve les données uniquement dans le navigateur de l’appareil.

## Nouveautés principales

- vues Jour, Semaine et Mois, jours fériés et week-ends identifiables ;
- heure de la première et de la dernière cliente dans le résumé du jour ;
- vue Semaine compacte avec les rendez-vous placés selon leur heure et leur durée ;
- création réorganisée : cliente, téléphone/contact, prestation, date/heure, durée, statut, adresse et notes ;
- heures proposées par pas de 5 minutes, tout en préservant les anciennes heures ;
- conflit détaillé avant validation, avec possibilité de conserver le rendez-vous ;
- suppléments multiples et personnalisables, inclus dans tous les totaux ;
- badges clientes personnalisables et suggestion de vigilance après plusieurs annulations tardives ;
- paiement laissé « À vérifier » à la création, puis validation depuis la fin de journée ;
- relances de paiement visibles sur l’accueil ;
- bilans semaine, mois et année, heures travaillées et export CSV ;
- filtres dans la clientèle, historique des rendez-vous et des modifications ;
- réglages rangés par catégories ;
- sauvegardes compatibles avec les anciennes versions et copie de sécurité avant migration/restauration ;
- brouillons des rendez-vous, clientes et indisponibilités ;
- assistant IA retiré pour alléger l’application.

## Installer ou mettre à jour avec GitHub Pages

Lis le fichier `GUIDE-MISE-A-JOUR.md` fourni avec cette version. Avant toute mise à jour, ouvre l’application sur l’iPhone et utilise **Réglages → Données et sauvegardes → Sauvegarder dans Fichiers**.

Après l’envoi des fichiers sur GitHub, attends une à deux minutes puis ouvre :

`https://bd87b9495f-blip.github.io/mon-agenda/?v=12`

L’application propose ensuite d’appliquer la nouvelle version. Dans **Réglages → À propos**, vérifie que `Mon agenda · version 12.0 bêta` est affiché.

## Données et confidentialité

- Les clientes, rendez-vous, paiements, indisponibilités, prestations, suppléments, badges et réglages restent sur l’iPhone.
- GitHub Pages héberge seulement les fichiers de l’application et ne reçoit pas la base de données.
- Ne dépose jamais un fichier de sauvegarde JSON dans le dépôt GitHub : il contient tes données professionnelles.
- Une mise à jour du code ne supprime pas les données locales. La version 12 migre automatiquement les données des versions précédentes.
- Une restauration réimporte les données dans la version actuelle : les anciens champs sont adaptés et les nouveaux champs prennent leurs valeurs par défaut.
- Les sauvegardes ne sont pas automatiques. Télécharge-en régulièrement et garde-les dans un emplacement personnel sûr.

## Limites assumées

- Les données ne sont pas synchronisées entre plusieurs appareils.
- Désinstaller l’application, supprimer les données Safari ou réinitialiser l’iPhone peut effacer les données locales ; la sauvegarde JSON est donc indispensable.
- Waze nécessite une connexion et reçoit l’adresse uniquement lorsque le bouton d’itinéraire est utilisé.
- GitHub Pages doit rester public avec un compte gratuit, mais aucune donnée cliente n’est placée dans les fichiers publiés.

## Fichiers utiles

- `index.html` : interface ;
- `style.css` : affichage mobile ;
- `app.js` : données et fonctions métier ;
- `sw.js` : fonctionnement hors connexion et mises à jour ;
- `manifest.webmanifest` et les icônes PNG : installation sur l’iPhone.
