# Mon agenda — candidate 2026.15

Application personnelle hors ligne pour organiser une activité de prothésiste ongulaire sur iPhone.

## Version et statut

| Élément | Valeur |
|---|---|
| Version visible | `2026.15` |
| Build technique et cache PWA | `2026.15.0` |
| Schéma des données | `v15` |
| Convention | `année.nombre total de commits` |
| Statut | candidate avant lancement |

La version 2026.15 correspond au quinzième commit prévu. Elle a passé la suite automatisée du projet, mais elle n’est pas encore déclarée stable sur iPhone réel : la checklist manuelle de `TESTS-2026.15.md` reste à exécuter avant le lancement.

## Fonctions principales

- agenda en vues Jour, Semaine et Mois ;
- clientes distinctes, y compris en cas d’homonymie ;
- prestations, suppléments, événements personnels et dépenses ;
- paiements à vérifier, à régler, payés ou remboursés ;
- Bilan par jour, semaine, mois ou année ;
- export CSV et sauvegarde JSON ;
- thème Clair ou Sombre et fonctionnement hors connexion.

Le périmètre de cette candidate est figé : aucune vue « Aujourd’hui » ni nouvelle fonction de relation cliente n’est ajoutée.

## Règles du Bilan

Le Bilan sépare **Prestations**, **Encaissements** et **Dépenses**. Ses chiffres suivent trois dates différentes :

- une prestation réalisée est comptée à la date du rendez-vous, uniquement après la fin d’un rendez-vous actif ;
- l’encaissement brut est compté à la date réelle du paiement ;
- le remboursement intégral est retranché à sa propre date ;
- le net d’une période vaut `encaissements bruts − remboursements` ;
- une annulation ou une absence n’efface ni un paiement ni un remboursement déjà enregistrés ;
- un paiement « À régler » reste à suivre même si le rendez-vous est ensuite annulé ou marqué absent ;
- un rendez-vous futur non vérifié n’apparaît pas dans « À vérifier » avant la fin de son créneau.

L’export CSV reprend la période et la rubrique affichées. Les colonnes financières calculées restent numériques pour permettre les totaux dans Numbers, Excel ou Sheets, y compris lorsqu’un net est négatif.

## Paiement, remboursement et verrou financier

- **À vérifier** : état initial d’un rendez-vous ; il ne devient visible dans les contrôles qu’après la fin du créneau.
- **À régler** : une date de relance est obligatoire et la dette reste visible dans les rappels, la fiche cliente, le Bilan et le CSV.
- **Payé** : une date réelle de paiement, au plus tard aujourd’hui, est obligatoire.
- **Remboursé** : la date du paiement est conservée et une date de remboursement comprise entre le paiement et aujourd’hui est obligatoire.

Dans la fin de journée, **✓ Payé aujourd’hui** enregistre aujourd’hui seulement si le rendez-vous n’était pas déjà payé. Pour un paiement existant, le bouton affiche **✓ Payé** et conserve sa date.

Dès qu’un rendez-vous est payé ou remboursé, sa prestation, son prix de base et ses suppléments sont figés afin de préserver les bilans historiques. Pour corriger un montant :

1. repasser d’abord le paiement dans un état non encaissé et enregistrer le rendez-vous ;
2. corriger la prestation, le prix ou les suppléments et enregistrer ;
3. enregistrer de nouveau le paiement ou le remboursement avec ses dates réelles.

## Stockage et sauvegardes

- IndexedDB est l’unique base inscriptible de l’application. La copie locale liée est seulement un miroir servant de preuve de provenance, de diagnostic ou de candidate de récupération ; elle n’est jamais un mode de fonctionnement ni un repli inscriptible.
- Les écritures portent une révision, des compteurs et une empreinte. Un conflit entre deux fenêtres est refusé au lieu d’écraser silencieusement une version plus récente.
- Une révision de stockage invalide bloque l’ouverture. La récupération explicitement confirmée repart alors sur une nouvelle lignée et vérifie par comparaison atomique que la source observée n’a pas changé.
- Chaque migration est ancrée à une date locale explicite et persistée. Une reprise, une copie automatique ou un retour arrière reproduit donc les mêmes corrections financières sans dépendre du jour courant.
- La provenance exacte d’une source migrée ou remplacée — empreinte brute, version, révision, base, clé et date — survit aux enregistrements suivants et à la rotation des copies. Un snapshot brut est également créé au moment du remplacement. Si le miroir n’a pas été réécrit, seule l’ancienne source exactement attestée est tolérée ; toute variante bloque l’ouverture.
- Jusqu’à cinq états valides précédant les dernières modifications sont conservés comme copies automatiques locales. Pour un enregistrement ordinaire, un manque de quota est signalé sans annuler la modification métier déjà enregistrée ; une opération qui exige une copie de sécurité est au contraire refusée avant toute mutation.
- Une source vide, ancienne, divergente ou sans métadonnées suffisantes ne remplace pas automatiquement une base potentiellement plus récente.
- Si IndexedDB est indisponible, ne peut pas être ouvert, tarde anormalement à répondre, ou si la lecture ou la provenance des sources est ambiguë, l’application s’arrête sur l’écran de récupération et n’écrit ni données métier ni miroir. Les relectures après création ou migration sont également bornées et ne rejouent pas un commit déjà réussi au prochain démarrage.
- Une donnée remplacée lors d’une récupération est conservée localement en quarantaine lorsque cela est possible.
- Une ancienne branche locale `legacy-fallback` n’est réintégrée qu’après le retour d’IndexedDB et seulement si sa filiation avec la base est prouvée.
- Une sauvegarde JSON est contrôlée par sa structure, ses versions déclarées, ses compteurs et son empreinte avant restauration ; les anciennes enveloppes ne peuvent pas annoncer une version contradictoire avec leur état.
- Chaque remplacement destructif exige une copie automatique IndexedDB et chaque retour arrière est lié atomiquement à la restauration qui l’a créé. Un journal local préparé avant le commit puis promu après celui-ci ajoute une seconde protection même si l’opération est interrompue ; une copie plus ancienne, illisible, ambiguë ou issue d’une autre restauration n’est jamais proposée à sa place.
- Les imports, retours à une copie automatique et annulations de restauration sont exclusifs. Toute autre mutation est refusée et annulée en mémoire tant qu’un remplacement complet est en cours.

Ces protections locales ne remplacent pas une sauvegarde régulière dans l’application Fichiers. Les données ne sont ni synchronisées avec GitHub ni chiffrées par un mot de passe propre à l’application. Ne publie jamais une sauvegarde JSON ou un export CSV dans un dépôt public.

## PWA et fonctionnement hors ligne

Le service worker utilise uniquement le cache du build `2026.15.0`, supprime les anciens caches de l’application et charge les fichiers versionnés. L’application peut ensuite s’ouvrir hors ligne tant que sa base IndexedDB reste disponible et vérifiable.

Lorsqu’une nouvelle version prend le contrôle, le rechargement est différé si un formulaire contient des modifications non enregistrées. Une mise à jour publiée ne doit pas être forcée en désinstallant la PWA ou en effaçant les données de Safari.

Avant toute mise à jour, fermer toutes les autres fenêtres et tous les autres onglets Safari ouverts sur Mon agenda, ainsi que toutes les instances de la PWA. Relancer ensuite une seule instance : l’application vérifie automatiquement cette condition et refuse d’ouvrir les données tant qu’elle ne voit pas exactement une fenêtre.

## Installation et mise à jour

Après publication sur GitHub Pages, ouvrir :

`https://bd87b9495f-blip.github.io/mon-agenda/?v=2026.15.0`

Dans **Réglages → À propos**, vérifier `Mon agenda · version 2026.15` et `données v15`. La migration détaillée depuis la v12.5 bêta se trouve dans `GUIDE-MISE-A-JOUR.md`.

## Tests automatisés

Depuis le dossier du projet, avec Node.js installé :

```bash
node --test tests/*.test.mjs
```

La suite couvre notamment la cohérence de la livraison, les règles du Bilan et du CSV, les dates de paiement et de remboursement, le verrou financier, les homonymes, les migrations, les sauvegardes rapides, le journal de restauration, les conflits de révision, les délais de démarrage, le blocage fail-closed du stockage, la filiation du miroir, les copies automatiques, le cache PWA et plusieurs contrôles d’accessibilité.

L’archive finale a réussi **131 tests sur 131**, sans échec. Les contrôles automatisés ne remplacent pas la validation manuelle sur un vrai iPhone décrite dans `TESTS-2026.15.md`.

## Fichiers principaux

- `index.html`, `style.css` : interface mobile, thèmes et accessibilité ;
- `app.js` : règles métier ;
- `storage.js` : stockage, migration, contrôles et récupération ;
- `sw.js`, `manifest.webmanifest`, `icon.svg`, `icon-180.png`, `icon-192.png` et `icon-512.png` : PWA et hors-ligne ;
- `GUIDE-MISE-A-JOUR.md` : migration et publication ;
- `TESTS-2026.15.md` : validation automatisée et checklist iPhone ;
- `CAHIER-DES-CHARGES-2026.15.md` : périmètre de la candidate ;
- `CHANGELOG.md` : changements de version.
