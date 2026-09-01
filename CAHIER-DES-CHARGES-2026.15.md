# Cahier des charges — périmètre 2026.15 validé, recette iPhone en attente

## 1. Objectif et statut

- Préparer une version complète, fiable et cohérente avant la première utilisation réelle.
- Corriger les défauts détectés dans la v12.5 bêta sans ouvrir de grand chantier fonctionnel.
- Conserver les vues Jour, Semaine et Mois ainsi que les clientes, événements personnels, dépenses, recherches, réglages et sauvegardes.
- Ne pas ajouter la vue « Aujourd’hui » ni de nouvelles fonctions de relation cliente.
- Afficher la version `2026.15`, correspondant au quinzième commit prévu, et utiliser le build technique `2026.15.0`.
- Livrer une **candidate** : les contrôles automatisés sont requis avant publication et la recette sur un vrai iPhone reste obligatoire avant de déclarer la version stable.

## 2. Données et migration

- Le schéma métier courant est `v15` et possède une migration explicite depuis les données de la v12.5 bêta et les formats historiques pris en charge.
- L’intégrité d’un ancien état est contrôlée dans son format d’origine avant migration.
- Une copie locale d’avant migration est créée lorsqu’un ancien état exploitable est converti.
- Un ancien paiement daté par erreur dans le futur est ramené au jour de migration et la correction est tracée dans l’historique du rendez-vous.
- La date locale de migration est enregistrée avec la source et réutilisée lors d’une reprise, d’une restauration ou d’un retour arrière afin que les corrections restent déterministes.
- Une base contenant des entités mais privée de métadonnées n’est jamais considérée comme une nouvelle installation.
- Une source de migration ou de récupération est caractérisée par sa provenance, son empreinte exacte, sa version, sa révision, sa base, sa clé et sa date. Un snapshot brut est créé au moment du remplacement ; l’attestation distincte survit aux écritures ordinaires et à la rotation des copies automatiques.
- Une révision de base absente, non entière ou inférieure à un est invalide. Elle bloque le démarrage ; une récupération confirmée ne repart sur une nouvelle lignée que si la métadonnée observée n’a pas changé pendant l’opération.
- Une source vide, plus ancienne, divergente ou ambiguë ne remplace pas automatiquement une base potentiellement plus récente.
- L’état remplacé lors d’une récupération est conservé localement en quarantaine lorsque cela est possible.

## 3. Stockage et écritures

- IndexedDB est l’unique stockage métier inscriptible et les écritures y restent atomiques.
- Une copie locale liée sert uniquement de miroir, de preuve de provenance, de diagnostic ou de candidate de récupération ; elle n’est jamais un mode de fonctionnement ni un repli inscriptible et ne doit pas écraser automatiquement une base principale plus récente.
- Si IndexedDB est indisponible ou ne peut pas être ouvert, si une ouverture ou une lecture dépasse le délai de démarrage, si une lecture est incertaine, ou si plusieurs sources sont ambiguës, l’application affiche l’écran de récupération et n’écrit ni données métier ni miroir.
- Une ancienne branche `legacy-fallback` ne peut être réintégrée qu’après le retour d’IndexedDB et si sa filiation exacte avec la base est démontrée.
- Jusqu’à cinq copies automatiques valides sont conservées. Une copie invalide n’est jamais proposée à la restauration.
- Une copie historique contient son contexte de migration ; une altération de sa date ou de son état invalide l’ensemble avant toute conversion.
- Un manque de quota pour une copie automatique est signalé sans invalider une écriture métier déjà réussie.
- Une restauration ou une autre opération exigeant une copie de sécurité est refusée sans modifier l’état, les métadonnées ni la révision si cette copie ne peut pas être créée.
- Un conflit de révision entre deux fenêtres est détecté ; aucune fenêtre ne doit écraser silencieusement l’autre.
- Les sauvegardes rapides sont ordonnées. Un échec ancien ne peut pas restaurer l’interface par-dessus un enregistrement plus récent réussi.
- Une relecture muette après une création ou une migration déjà commise bloque proprement puis, au prochain démarrage, relit le commit existant sans le rejouer.
- Un échec du miroir est visible dans l’état du stockage et le diagnostic, sans annuler une transaction IndexedDB déjà réussie.
- Après un échec du premier commit d’une installation neuve, un nouvel essai peut initialiser proprement la base restée vide.

## 4. Sauvegarde JSON et récupération

- L’export contient le type d’application, la version du format, la version des données, la date, le motif, les compteurs, l’état et l’empreinte.
- La vérification contrôle la taille, la structure, la compatibilité et la cohérence des versions déclarées, les compteurs et l’empreinte avant toute restauration, y compris pour les enveloppes historiques prises en charge.
- Les références essentielles entre rendez-vous, clientes et réglages sont contrôlées ou normalisées sans perte silencieuse.
- Une sauvegarde provenant d’une version de données future, tronquée, incohérente ou altérée est refusée sans modifier la base active.
- Les sauvegardes historiques prises en charge restent importables selon leurs règles de compatibilité.
- Une copie automatique IndexedDB obligatoire et vérifiée précède tout remplacement destructif. Un journal local ajoute une seconde protection : il est lié par un identifiant atomique à une seule opération, préparé avant le commit puis promu après celui-ci, afin qu’une interruption, une copie historique, divergente ou illisible ne puisse jamais sélectionner le mauvais état.
- Les remplacements complets de données sont mutuellement exclusifs. Le système attend les écritures déjà acceptées, puis refuse et annule toute mutation ordinaire jusqu’à la publication de l’état remplacé.
- Le diagnostic technique exclut noms, coordonnées, adresses, notes et contenu des rendez-vous.

## 5. Règles financières

- Les états de paiement sont **À vérifier**, **À régler**, **Payé** et **Remboursé**.
- Une prestation réalisée est comptée à la date du rendez-vous, uniquement après la fin d’un rendez-vous actif.
- Un futur rendez-vous **À vérifier** n’est pas présenté comme paiement à contrôler avant la fin de son créneau.
- Un état **À régler** exige une date de relance et reste visible dans les rappels, la fiche cliente, le Bilan et le CSV, même après annulation ou absence.
- La date réelle du paiement détermine l’encaissement brut, indépendamment du statut ultérieur du rendez-vous.
- Un rendez-vous annulé ou marqué absent conserve tout paiement déjà enregistré.
- L’état **Remboursé** conserve la date du paiement initial et retranche intégralement le montant à la date réelle du remboursement.
- Une date de paiement future est refusée pour une nouvelle saisie ou un import. Une date de remboursement future ou antérieure à la date du paiement est refusée. Un état v15 déjà validé reste toutefois lisible si l’horloge de l’appareil recule ensuite.
- Dans la fin de journée, **✓ Payé aujourd’hui** affecte la date du jour uniquement à un rendez-vous non payé ; **✓ Payé** conserve la date d’un paiement existant.
- Dès qu’un paiement ou un remboursement est enregistré, la prestation, le prix de base et les suppléments du rendez-vous sont figés. La correction exige d’abord l’enregistrement d’un état non encaissé, puis l’ajustement du montant, puis le nouvel enregistrement du flux réel.
- Le résumé quotidien, le Bilan et l’export CSV appliquent les mêmes règles.
- Les catégories historiques de dépenses restent distinctes même si elles ne sont plus actives.

## 6. Vue Bilan et CSV

- La période Jour, Semaine, Mois ou Année est sélectionnable directement.
- Le résumé principal apparaît avant le détail.
- Les onglets Prestations, Encaissements et Dépenses sont conservés ; le bloc « Accès rapide » redondant est supprimé.
- Le tri Nombre/Montant reste disponible uniquement dans l’onglet Prestations où il est utile.
- Les montants distinguent encaissement brut, remboursement intégral et net.
- Le nombre d’activités suit les rendez-vous réalisés ; les flux financiers suivent leurs dates réelles, y compris après annulation ou absence.
- Le détail reste accessible depuis les classements et paiements.
- L’export CSV correspond à la rubrique et à la période visibles, contient brut, remboursé et net, et conserve les valeurs financières calculées sous forme numérique.

## 7. Clientes et homonymes

- Deux clientes possédant exactement le même nom peuvent être créées et conservées séparément.
- Le nom seul ne déclenche jamais la modification automatique d’une fiche existante.
- Si plusieurs fiches correspondent au même téléphone ou au même nom, elles sont toutes proposées et l’utilisatrice choisit explicitement la bonne fiche ou la création d’une nouvelle.
- Les anciennes fiches homonymes restent reliées à leurs propres rendez-vous par leur identifiant.

## 8. Interface et accessibilité

- Le thème sombre couvre les surfaces principales avec un contraste lisible.
- Les couleurs d’action et les textes secondaires possèdent un contraste renforcé.
- Chaque dialogue possède un nom accessible.
- Les erreurs importantes sont annoncées et reliées aux champs concernés.
- Les commandes de vérification et de restauration de fichiers restent utilisables au clavier et avec les technologies d’assistance.
- Le focus est visible et les petites cibles tactiles du planning sont renforcées sans modifier la densité choisie.

## 9. PWA et mises à jour

- Les scripts, feuilles de style, manifeste, enregistrement du service worker et nom du cache sont cohérents avec le build `2026.15.0`.
- Le service worker installe tout le shell, icônes comprises, avec une revalidation réseau et sans réutiliser l’ancien cache HTTP.
- Un cache de build n’est jamais mélangé avec celui d’une autre livraison et les anciens caches de Mon agenda sont supprimés à l’activation.
- La navigation tente le réseau puis utilise l’interface locale validée en mode hors ligne.
- Lorsqu’un nouveau contrôleur prend le relais pendant une saisie non enregistrée, le brouillon est conservé et le rechargement automatique est différé.
- La recherche de mise à jour est relancée au retour au premier plan avec une fréquence limitée.
- Les erreurs du service worker sont conservées dans le diagnostic technique.
- Avant toute lecture des anciennes données, la PWA confirme qu’elle exécute le build courant et qu’exactement une fenêtre de Mon agenda est active. Sinon elle bloque l’ouverture, ne force aucun autre rechargement et demande de fermer les autres fenêtres ou instances.

## 10. Critères de validation avant lancement

### Automatisé

- La commande `node --test tests/*.test.mjs` termine sans échec sur l’archive finale.
- Syntaxe JavaScript, versions, manifeste, ressources, identifiants HTML, références DOM et relations ARIA sont contrôlés.
- Des scénarios reproductibles couvrent migration, empreinte, sauvegardes, copies automatiques, corruption, quota, concurrence, stockage fail-closed, filiation du miroir, cache PWA et calculs financiers critiques.
- Les cas de paiement/remboursement à dates réelles, dette maintenue après annulation, homonymes, verrou financier et CSV sont couverts.

### Manuel restant sur vrai iPhone

- Migration depuis la v12.5 avec comparaison des compteurs et d’éléments représentatifs.
- Fermeture forcée, reprise, fonctionnement hors ligne et réouverture des données enregistrées.
- Sauvegarde, vérification, restauration puis annulation de la restauration.
- Parcours paiement, remboursement, annulation, absence, relance, Bilan et CSV dans Numbers.
- Mise à jour PWA avec brouillon non enregistré, thèmes, cibles tactiles et VoiceOver.

La recette iPhone n’est pas réputée faite par la présence de tests automatisés. Aucun lancement réel ne doit être décidé tant qu’elle n’est pas exécutée et consignée, ou si un défaut connu peut entraîner perte de données, incohérence financière ou blocage au démarrage.
