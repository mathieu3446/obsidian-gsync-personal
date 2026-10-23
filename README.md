# GSync Personal — version 2.1.0

> **Migration depuis 2.0.1 :** mets à jour tous les appareils, note ton Bound folder ID, déclare le scope `https://www.googleapis.com/auth/drive` dans Google Cloud, puis utilise **Sign in again** sur chaque appareil et rétablis cet ID. Le chiffrement des identifiants est conservé. [Étapes détaillées](guide%20de%20mise%20en%20placec.md).

**Guide complet PC, iPhone et Google Drive : [guide de mise en placec](guide%20de%20mise%20en%20placec.md).**

Fork personnel de [GSync par dg0988](https://github.com/dg0988/ObsidianGSync), sous licence MIT. Le projet original n'est pas responsable de ces modifications. Ce fork n'est pas une version officielle approuvée par Obsidian ou Google.

## Installation rapide

1. Télécharge [le ZIP installable](downloads/gsync-personal-2.1.0.zip).
2. Ferme Obsidian. Dans une **copie de ton coffre**, crée `.obsidian/plugins/gsync-personal/`.
3. Extrais dans ce dossier `main.js`, `manifest.json` et `LICENSE` (sans sous-dossier supplémentaire).
4. Relance Obsidian et active **GSync Personal** dans les extensions communautaires.
5. Désactive l'ancien GSync et tout autre moteur de synchronisation pour ce coffre. Ce fork n'importe pas ses anciens paramètres ni ses jetons.

Sur iPhone, installe BRAT depuis les extensions communautaires Obsidian, puis ajoute `mathieu3446/obsidian-gsync-personal` et sélectionne la release `2.1.0`. Les étapes détaillées sont dans le guide complet ci-dessus. L'archive de code source n'est pas le ZIP installable.

## Google : configuration initiale

Aucun serveur à administrer ni abonnement supplémentaire. La connexion utilise une page statique sur **ton** GitHub Pages, puis les échanges se font directement avec Google.

1. Dans [Google Cloud](https://console.cloud.google.com/), crée un projet dédié et active **Google Drive API**.
2. Configure l'écran de consentement OAuth pour ton utilisation personnelle et ajoute ton compte comme utilisateur test si le projet reste en test.
3. Crée un client OAuth de type **Application Web**. Utilise un client dédié à ce fork, identique sur tous tes appareils.
4. Ajoute exactement cette URI de redirection autorisée :

   `https://mathieu3446.github.io/obsidian-gsync-personal/callback.html`

5. Dans Obsidian → GSync Personal, renseigne le client ID et le client secret, puis choisis une **phrase secrète d'au moins 14 caractères**. Ne les ajoute jamais au dépôt GitHub.
6. Clique **Save credentials**, puis **Sign in with Google**. Termine la connexion dans le navigateur et clique **Revenir à Obsidian**. Garde le même coffre ouvert ; si le système ferme l'application pendant la connexion, recommence.
7. Enregistre les paramètres si tu as changé le nom du dossier. Sur le **premier appareil uniquement**, clique **Create new destination**. Sur les suivants, renseigne directement l’identifiant du dossier existant et enregistre les paramètres. Clique ensuite **Sync** pour un premier essai. La synchronisation automatique est désactivée au départ ; active-la ensuite si tu le souhaites.

En mode OAuth « test », Google peut faire expirer l'autorisation après sept jours. Une mise en production personnelle peut éviter cette contrainte selon la configuration de Google. Une éventuelle demande de vérification Google dépend du compte et des paramètres ; aucune désactivation de protection n'est requise par le plugin.

## Dossier Drive et deuxième appareil

Le plugin demande le scope étendu `drive` pour découvrir aussi les fichiers ajoutés manuellement ou par d’autres applications dans le dossier lié. Le jeton peut gérer tout le Drive ; le code de synchronisation ne parcourt que le dossier lié. Le bouton **Create new destination** crée explicitement un dossier dédié, dont le nom porte un suffixe unique. La synchronisation ne crée jamais de destination automatiquement. Les fichiers Markdown ajoutés par toi ou ChatGPT Work dans cette destination sont désormais découvrables. Un autre dossier Drive ne sera pas synchronisé automatiquement. Les limites de format, taille et nom restent appliquées.

Après la création de la destination, copie l'ID affiché dans **Bound folder ID**. Sur le deuxième appareil, utilise le même compte Google et le même client OAuth, connecte-toi, puis renseigne cet ID avant la première synchronisation. La phrase secrète locale peut être différente sur chaque appareil.

Renommer ou déplacer le dossier Drive ne change pas l'ID mémorisé. S'il devient inaccessible ou part à la corbeille, la synchronisation s'arrête ; restaure le dossier ou choisis explicitement une nouvelle destination. Ne vide pas l'ID pour contourner une erreur sans vérifier la destination.

## Ce qui a changé

- Autorisation Google étendue (`drive`) à la demande de l’utilisateur pour un compte dédié ; synchronisation limitée par le code à la destination liée.
- Client secret et refresh token chiffrés localement en AES-256-GCM, avec clé dérivée de la phrase secrète par PBKDF2-SHA256 (600 000 itérations). Sel et nonce aléatoires.
- Phrase secrète et vérificateur PKCE conservés uniquement en mémoire ; déverrouillage nécessaire après chaque redémarrage.
- Aucun bouton pour copier le refresh token ; déconnexion par révocation Google effective. Un bouton distinct verrouille simplement l'appareil.
- Redirection sur ta page GitHub Pages, sans nom du coffre, sans ressources tierces, sans télémétrie.
- Dossier distant lié par ID ; chemin vide et noms de fichiers dangereux refusés.
- **Aucune suppression automatique** : un fichier absent d'un côté est restauré depuis l'autre. Pour supprimer définitivement une note, arrêter la synchronisation sur tous les appareils et la retirer des deux côtés.
- Comparaison SHA-256 du contenu local ; versions Drive ; copies de conflit aux noms uniques.
- Avant remplacement, copie de récupération locale ; remplacement Markdown via l'opération atomique `Vault.process`.
- Les changements binaires distants créent une copie de conflit au lieu d'écraser un fichier local existant. Examiner puis choisir manuellement la version à conserver.
- Mises à jour Drive conditionnées par ETag et version : si Google ne fournit pas l'ETag ou refuse la condition, le plugin s'arrête pour ce fichier au lieu d'écraser aveuglément.
- Formats autorisés explicitement ; fichiers cachés, configuration et exécutables exclus par défaut. Limite de 25 Mo par fichier.
- Dépendances de développement réduites, verrouillées et vérifiées. Actions GitHub épinglées sur des commits et accès en lecture seule.

## Limites et récupération

**Les notes ne sont pas chiffrées de bout en bout.** Elles restent lisibles dans Drive, pour Google et pour les personnes ayant accès au dossier. Le chiffrement local protège les identifiants sauvegardés, pas un appareil compromis ni un autre plugin malveillant lorsque ce plugin est déverrouillé.

Les snapshots sont dans `.gsync-personal-backups/` du coffre : chaque paire `.json` / `.bin` donne le chemin d'origine et les octets récupérables. Copier le `.bin` vers un nouveau fichier avec l'extension d'origine pour récupérer une version. Les snapshots ne sont pas synchronisés par ce plugin et ne sont jamais purgés automatiquement ; ils peuvent contenir des données sensibles et occuper de la place. Garder une sauvegarde indépendante du coffre.

Une phrase secrète perdue ne peut pas être récupérée. Révoquer l'application dans les [autorisations Google](https://myaccount.google.com/permissions), désactiver le plugin, mettre de côté son `data.json`, puis reconfigurer. Les notes locales et Drive restent disponibles. Les anciennes sauvegardes de `data.json` de l'ancien plugin peuvent encore contenir des jetons en clair : révoquer l'ancienne autorisation.

La page statique reçoit un code OAuth temporaire dans son URL. PKCE empêche de l'échanger sans le vérificateur présent sur l'appareil. GitHub héberge cette page et peut traiter les métadonnées HTTP. Les notes et refresh tokens ne passent pas par cette page.

## Vérifications

Compilation TypeScript et tests automatisés avec API Obsidian/Drive simulées. `npm audit` vérifie les avis connus des dépendances. Cela ne remplace pas un audit indépendant ni un essai réel de connexion Google, de synchronisation entre appareils et de reprise après fermeture de l'application. Ces essais réels nécessitent tes identifiants privés et restent à effectuer sur un coffre de test.

```sh
npm ci --ignore-scripts
npm test
npm run build
npm audit
```

Node.js 22 ou plus récent. Les dépendances servent à la compilation ; `main.js` n'intègre pas le SDK Obsidian, fourni par l'application. Le dépôt contient le bundle compilé et un ZIP ; le workflow reconstruit et vérifie le bundle à chaque modification.

## Origine

Sources initiales : archive ObsidianGSync-main.zip, version déclarée 1.0.4.
SHA-256 de l'archive initiale : `0956191bc171d6f7786ff9c3e3badc6a7af1bee4e86b496709620042cdd43dc3`.
La licence et le copyright de dg0988 sont conservés dans LICENSE.
