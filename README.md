# Mon agenda — version 12.2 bêta

Application personnelle et gratuite pour organiser une activité de prothésiste ongulaire. Elle s’installe sur l’écran d’accueil de l’iPhone, fonctionne hors connexion après une première ouverture en ligne et conserve les données professionnelles dans le navigateur de l’appareil.

## Nouveautés de la version 12.2

### Une prise de rendez-vous plus simple

- après le choix de la prestation, la durée et le tarif sont regroupés dans un résumé compact ; le bouton **Ajuster** permet toujours une modification exceptionnelle ;
- les coordonnées d’une cliente existante sont résumées sans encombrer le formulaire et restent modifiables ;
- les formulaires longs sont découpés en sections, avec une barre d’action accessible et des boutons plus explicites ;
- les zones tactiles, les contrastes et les états sélectionnés ont été harmonisés pour améliorer la lisibilité sur l’iPhone ;
- les réglages sont regroupés en six rubriques : agenda, prestations, suppléments, clientes, données et à propos.

### Repères clientes avec les emojis de l’iPhone

- chaque repère possède un nom et un emoji saisi directement avec le clavier de l’iPhone ;
- le repère reste visible dans la fiche cliente, la sélection d’une cliente et le planning ;
- les anciens symboles sont conservés lors de la migration et peuvent ensuite être remplacés par un emoji ;
- les couleurs de prestations restent indépendantes des repères clientes.

### Événements personnels

L’ancienne fonction **Bloquer un créneau** devient **Événement personnel** : rendez-vous médical, déplacement, congés, information familiale ou toute autre occupation non professionnelle.

- événement sur une journée entière ou sur plusieurs journées entières ;
- événement avec une date et une heure de début et de fin, y compris sur deux jours différents ;
- choix **Bloquer les rendez-vous clients** activable ou désactivable pour chaque événement ;
- les événements bloquants participent aux alertes de conflit, mais il reste possible d’enregistrer volontairement le rendez-vous ;
- les événements informatifs restent visibles sans rendre le créneau indisponible ;
- plusieurs événements personnels peuvent se chevaucher ;
- les événements sur plusieurs jours sont présentés comme des bandeaux continus dans la vue Mois ;
- une adresse facultative peut être utilisée pour ouvrir l’itinéraire ;
- les anciens créneaux bloqués sont automatiquement convertis en événements personnels bloquants.

Les événements personnels n’entrent jamais dans les revenus, paiements, heures de prestation ou statistiques clientes.

### Suivi informatif des dépenses

Le bouton central **+** permet maintenant d’ajouter une dépense liée à l’activité :

- catégorie personnalisable ;
- contenu ou articles facultatifs ;
- fournisseur facultatif ;
- date et montant ;
- modification ou suppression ultérieure depuis le bilan.

La rubrique **Dépenses** du bilan propose des vues Jour, Mois et Année, une liste chronologique, les totaux, le nombre d’achats, la moyenne et une répartition par catégorie. Les dépenses sont volontairement séparées des revenus : elles sont affichées à titre informatif et ne sont jamais déduites du chiffre d’affaires.

## Fonctions conservées et améliorées

- vues Jour, Semaine et Mois, avec jours fériés et week-ends identifiables ;
- heures proposées par pas de 5 minutes, tout en préservant les anciennes heures ;
- avertissements de conflit détaillés et possibilité d’enregistrer malgré le conflit ;
- suppléments multiples, prix proposés par défaut et montants modifiables par rendez-vous ;
- ajustement du prix et des suppléments depuis la fin de journée ;
- paiement laissé **À vérifier** à la création puis validé depuis la fin de journée ;
- bilans d’activité Semaine, Mois et Année et exports CSV séparés ;
- historique des rendez-vous, filtres clientes, annulations tardives et suggestion de vigilance ;
- confirmation avant de quitter une saisie modifiée, brouillons locaux et protection contre les doubles appuis ;
- sauvegardes JSON, aperçu avant restauration et copie locale de sécurité avant une migration ou une restauration ;
- fonctionnement hors ligne, sans publicité, analyseur externe ni assistant IA.

## Compatibilité et migration

La version 12.2 adapte automatiquement les données des versions précédentes :

- rendez-vous, clientes, paiements, prestations, suppléments, repères et réglages sont conservés ;
- les anciens créneaux bloqués deviennent des événements personnels avec le blocage des rendez-vous activé ;
- les anciens repères conservent leur symbole jusqu’à leur prochaine modification ;
- les nouvelles catégories de dépenses sont ajoutées sans modifier les revenus existants ;
- une copie locale de sécurité est créée avant l’adaptation des données.

Une migration ne remplace pas une sauvegarde personnelle. Avant la mise à jour, utilise toujours **Réglages → Données et sauvegardes → Sauvegarder dans Fichiers**.

## Installer ou mettre à jour avec GitHub Pages

Lis le fichier `GUIDE-MISE-A-JOUR.md` fourni avec cette version. Après l’envoi des fichiers sur GitHub, attends une à deux minutes puis ouvre :

`https://bd87b9495f-blip.github.io/mon-agenda/?v=12.2`

Accepte ensuite la mise à jour proposée par l’application. Dans **Réglages → À propos**, vérifie que `Mon agenda · version 12.2 bêta` est affiché.

## Données et confidentialité

- Les clientes, rendez-vous, paiements, événements personnels, dépenses et réglages restent sur l’iPhone.
- GitHub Pages héberge seulement les fichiers de l’application et ne reçoit pas la base de données.
- Ne dépose jamais un fichier de sauvegarde JSON dans le dépôt GitHub : il contient tes données professionnelles.
- Les sauvegardes et exports peuvent être envoyés vers la feuille de partage iOS ; la destination reste choisie par l’utilisatrice dans l’application Fichiers.
- Waze nécessite une connexion et reçoit l’adresse uniquement lorsque le bouton d’itinéraire est utilisé.

## Limites importantes

- Les données ne sont pas synchronisées entre plusieurs appareils.
- Désinstaller l’application, effacer les données Safari ou réinitialiser l’iPhone peut supprimer les données locales.
- Ne supprime pas l’application et n’efface pas ses données pour forcer une mise à jour : utilise le bandeau de mise à jour et conserve une sauvegarde JSON récente.
- iOS ne permet pas à une application web d’imposer ou de mémoriser silencieusement un dossier d’export.

## Fichiers utiles

- `index.html` : interface ;
- `style.css` : affichage mobile ;
- `app.js` : données et fonctions métier ;
- `sw.js` : fonctionnement hors connexion et mises à jour ;
- `manifest.webmanifest` et les icônes PNG : installation sur l’iPhone.
