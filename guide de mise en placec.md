# guide de mise en place

Guide complet pour installer **GSync Personal 2.1.1** sur **PC Windows et iPhone**, avec **Google Drive** comme espace de synchronisation.

Préparé le 22 octobre 2026 pour [mathieu3446/obsidian-gsync-personal](https://github.com/mathieu3446/obsidian-gsync-personal). Les menus peuvent légèrement varier selon la langue et la version.

> Commence sur une copie du coffre. Les 42 tests automatisés utilisent des API simulées : ils ne remplacent pas les essais réels sur tes appareils. Une synchronisation ne remplace pas une sauvegarde indépendante.

## Correctif 2.1.1 : mise à jour depuis 2.1.0

Cette version corrige le refus d’envoyer une note modifiée lorsque Google ne fournit pas d’ETag dans les réponses v3. Le plugin récupère désormais l’ETag JSON avec Drive v2 et utilise la même version de l’API pour l’envoi conditionnel. Il conserve le type du fichier et vérifie les octets envoyés par relecture avant de mémoriser la synchronisation.

1. Termine les transferts et garde une sauvegarde du coffre. Note ton **Bound folder ID** et mets l’intervalle automatique à **0** pendant la mise à jour.
2. **PC manuel :** télécharge [gsync-personal-2.1.1.zip](https://github.com/mathieu3446/obsidian-gsync-personal/releases/download/2.1.1/gsync-personal-2.1.1.zip), extrais-le, ferme Obsidian, puis remplace seulement **main.js et manifest.json** dans le dossier **.obsidian/plugins/gsync-personal/** du coffre. **Conserve data.json.**
3. **iPhone ou PC avec BRAT :** paramètres BRAT, bouton de modification du dépôt **mathieu3446/obsidian-gsync-personal**, sélectionne **2.1.1** et valide. Une version figée en 2.1.0 ne se met pas à jour avec la simple recherche de mises à jour.
4. Relance Obsidian, vérifie la version **2.1.1**, puis déverrouille avec ta phrase secrète habituelle. **Depuis 2.1.0 déjà autorisée, aucune reconnexion Google ni modification de Google Cloud n’est nécessaire.** Conserve le même dossier ID ; ne crée pas une nouvelle destination.
5. Sur une note de test déjà envoyée, ajoute **[[Autre note]]**, lance Sync, puis vérifie le contenu sur Drive et sur le deuxième appareil. Fais une seconde modification et recommence pour vérifier les mises à jour successives.
6. Réactive ton intervalle habituel après ce test.

Si Google renvoie un véritable conflit de version (412), le plugin garde les modifications locales et demande de relancer. Une erreur de vérification ne doit pas être ignorée. Les 42 tests utilisent des services simulés ; l’essai réel sur tes appareils reste nécessaire.

Si tu viens encore de 2.0.1, suis aussi la migration d’autorisation ci-dessous.

## Mise à jour depuis 2.0.1 : conserver le dossier existant

1. Note le **Bound folder ID** actuel sur tes appareils et conserve une sauvegarde des notes.
2. Mets l’intervalle automatique à **0** et arrête les synchronisations sur tous les appareils.
3. Installe **2.1.1 sur le PC et l’iPhone avant de réautoriser Google**. Sur PC, remplace main.js et manifest.json, sans effacer data.json ; sur iPhone, mets à jour avec BRAT (si la version est figée, sélectionne 2.1.1).
4. Dans le projet Google Cloud du client utilisé, ouvre **Google Auth Platform → Data Access** et déclare le scope **https://www.googleapis.com/auth/drive** à la place de drive.file. Garde ton compte parmi les utilisateurs tests si l’app reste en Testing.
5. Sur chaque appareil, déverrouille GSync Personal puis clique **Sign in again**. Autorise l’accès étendu avec le même compte Google.
6. Après chaque connexion, remets le **Bound folder ID noté à l’étape 1** et clique **Save settings**. Ne clique pas sur Create new destination.
7. Ajoute un vrai fichier .md depuis Drive ou ChatGPT Work **dans ce dossier lié**, puis lance Sync : il doit être téléchargé dans Obsidian si son nom, son format et sa taille sont autorisés.
8. Réactive éventuellement ton intervalle automatique, par exemple **3 minutes**, après avoir vérifié le bilan. Le déverrouillage reste manuel après redémarrage.

L’accès Google peut désormais gérer tous les fichiers du compte ; le code de synchronisation ne parcourt que le dossier lié. Ce choix vise ici un compte Drive dédié au second cerveau. Le chiffrement AES-GCM des identifiants, la phrase secrète, PKCE, les copies de récupération et l’absence de suppressions automatiques sont conservés. Les notes sur Drive ne sont pas chiffrées de bout en bout.

## Sommaire

1. Comprendre le fonctionnement et préparer le matériel
2. Préparer un coffre de test sur PC
3. Configurer Google Cloud
4. Installer le plugin sur PC
5. Connecter le PC et créer la destination Drive
6. Installer sur iPhone avec BRAT
7. Connecter l’iPhone au même dossier
8. Tester la synchronisation
9. Utilisation quotidienne et réglages
10. Dépannage
11. Sauvegarde, récupération et déconnexion
12. Checklist finale

## 1. Comprendre le fonctionnement et préparer le matériel

Le circuit est :

    Coffre local PC ⇄ GSync Personal ⇄ Dossier Google Drive
                                             ⇅
                                      GSync Personal
                                             ⇅
                                     Coffre local iPhone

Chaque appareil garde ses fichiers localement. GSync Personal les transfère pendant qu’Obsidian fonctionne.

Tu as besoin de :

- Obsidian sur PC : [téléchargement officiel](https://obsidian.md/download).
- Obsidian sur iPhone depuis l’App Store, application publiée par **Dynalist Inc.**
- Un compte Google dédié au second cerveau, avec de l’espace dans Drive, identique sur les deux appareils.
- Internet et un navigateur pour les connexions.
- Un gestionnaire de mots de passe.
- BRAT sur l’iPhone, installé à l’étape 6 depuis Obsidian.

**Pas besoin de compiler, d’installer Node.js, de louer un serveur, ni d’installer Google Drive sur l’iPhone.** Le dépôt et la page GitHub Pages de connexion sont déjà publiés.

### Les éléments à conserver

| Élément | Utilité | Où l’utiliser |
|---|---|---|
| Client ID OAuth | Identifie ton application Google dédiée | Dans le plugin sur les deux appareils |
| Client secret OAuth | Accompagne les échanges de connexion | Dans le plugin sur les deux appareils |
| Phrase secrète locale | Chiffre les identifiants sauvegardés sur l’appareil | À la configuration puis au déverrouillage |
| Bound folder ID | Identifie le dossier Drive commun | Créé sur PC, puis recopié sur iPhone |

Le **client ID et le client secret sont les mêmes sur PC et iPhone** pour cette version. La phrase secrète peut être différente sur chaque appareil. Conserve-les dans ton gestionnaire de mots de passe, jamais dans GitHub ou une note synchronisée.

Les notes dans Drive restent lisibles par Google et les personnes ayant accès au dossier. Le chiffrement local du plugin concerne les identifiants : **ce n’est pas du chiffrement de bout en bout des notes**.

## 2. Préparer un coffre de test sur PC

1. Ferme Obsidian si tu copies un coffre existant.
2. Fais une sauvegarde complète de tes notes à un autre emplacement.
3. Crée un dossier de test local, par exemple **C:\ObsidianLocal\GSync-Test**.
4. Évite un dossier géré par OneDrive, iCloud ou Google Drive pour ordinateur.
5. Dans Obsidian, sélectionne **Ouvrir un dossier comme coffre** et choisis ce dossier.
6. Mets-y deux ou trois notes et une petite image.
7. Désactive l’ancien GSync et les autres plugins de synchronisation dans ce coffre. N’utilise pas Obsidian Sync en parallèle.

Un « coffre » est le dossier contenant tes notes Obsidian.

Si tes notes sont déjà dans un ancien dossier Drive, pars d’une **copie locale sur PC**. Cette version synchronise uniquement la destination liée par son ID. Place les ajouts de Drive ou ChatGPT Work dans cette destination, plutôt que dans un dossier séparé.

Voir les [recommandations générales Obsidian sur la synchronisation](https://obsidian.md/help/Getting%20started/Sync%20your%20notes%20across%20devices).

## 3. Configurer Google Cloud

Fais cette partie sur PC, une seule fois. **Google Cloud** sert à créer l’autorisation de connexion ; **Google Drive** stockera les notes.

### 3.1 Créer un projet et activer Google Drive API

1. Ouvre [Google Cloud Console](https://console.cloud.google.com/) avec le compte Google choisi.
2. En haut, ouvre le sélecteur de projet, puis **Nouveau projet / New project**.
3. Nomme-le, par exemple **GSync Personal Mathieu**, et crée-le avec l’emplacement proposé pour ton compte.
4. Sélectionne ce nouveau projet dans la barre du haut.
5. Ouvre **API et services → Bibliothèque / APIs & Services → Library**.
6. Recherche **Google Drive API**, ouvre sa fiche et clique **Activer / Enable**.

Résultat attendu : Google Drive API est activée dans le bon projet. Aucune machine virtuelle ni serveur n’est nécessaire pour cette configuration.

Référence : [création d’un projet Google Cloud](https://developers.google.com/workspace/guides/create-project).

### 3.2 Configurer le consentement OAuth

1. Ouvre **Google Auth Platform**. L’ancien menu peut s’appeler **API et services → Écran de consentement OAuth**.
2. Si une configuration initiale apparaît, clique **Premiers pas / Get started**.
3. Renseigne le nom de l’application, par exemple **GSync Personal Mathieu**, ton adresse d’assistance et ton adresse de contact.
4. Pour un compte personnel, choisis **Externe / External**.
5. Pour démarrer, conserve le statut **Test / Testing**.
6. Dans **Audience → Utilisateurs tests / Test users**, ajoute l’adresse Google que tu utiliseras sur les deux appareils.
7. Enregistre.

Si Google demande des éléments supplémentaires, suis les indications adaptées à ton compte : n’invente pas de domaine. Un compte professionnel ou scolaire peut dépendre des restrictions de son administrateur.

Référence : [configuration du consentement OAuth](https://developers.google.com/workspace/guides/configure-oauth-consent).

### 3.2.1 Compléter la personnalisation avant de quitter le mode test

Si Google demande le nom, l’adresse d’assistance, la page d’accueil et la politique de confidentialité, ouvre **Google Auth Platform → Personnalisation / Branding** :

- **Nom de l’application :** GSync Personal, ou GSync Personal Mathieu.
- **Adresse d’assistance :** sélectionne ton adresse Google dans la liste proposée. Renseigne aussi ton adresse de contact développeur si elle est demandée.
- **Page d’accueil :** https://mathieu3446.github.io/obsidian-gsync-personal/
- **Politique de confidentialité :** https://mathieu3446.github.io/obsidian-gsync-personal/privacy.html

Enregistre, puis retourne dans **Audience** pour demander le passage **En production** après tes essais. Ces pages sont hébergées par GitHub Pages ; aucun serveur supplémentaire n’est nécessaire. Elles ne remplacent pas l’URI de redirection OAuth **callback.html**, qui doit rester inchangée dans le client Google et le plugin.

Pour un usage personnel, la vérification des permissions bénéficie d’une exception ; un avertissement d’application non vérifiée peut rester. Si Google demande une validation du domaine ou affiche un autre blocage, relève le message exact : ne déclare pas un domaine que tu ne contrôles pas. Passer en production ne publie pas le plugin dans le catalogue Obsidian, mais retire la restriction aux seuls utilisateurs tests.

Référence : [personnalisation OAuth Google](https://support.google.com/cloud/answer/15549049).

### 3.3 Déclarer l’accès étendu à Drive

Dans **Accès aux données / Data Access**, ouvre **Ajouter ou supprimer des champs d’application / Add or remove scopes**, puis déclare :

    https://www.googleapis.com/auth/drive

Ce scope autorise techniquement la gestion de tous les fichiers Drive accessibles au compte. Il est nécessaire ici pour découvrir automatiquement les fichiers ajoutés dans la destination par toi ou par une autre application, comme ChatGPT Work. Le plugin parcourt seulement le dossier lié par **Bound folder ID** ; cette limitation vient de son code, pas du jeton Google.

La permission est classée « restricted » par Google. Pour tes essais personnels, garde ton compte comme utilisateur test. Les conditions de vérification pour une diffusion publique sont distinctes : l’accès étendu ne garantit pas une validation Google.

Référence : [permissions Google Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

### 3.4 Créer le client OAuth

1. Ouvre **Google Auth Platform → Clients → Créer un client / Create client**. Ancien chemin possible : **API et services → Identifiants → Créer des identifiants → ID client OAuth**.
2. Choisis **Application Web / Web application**. C’est le type prévu par ce plugin, même pour Windows et iPhone.
3. Nomme le client, par exemple **GSync Personal PC et iPhone**.
4. Dans **URI de redirection autorisés / Authorized redirect URIs**, ajoute exactement :

    https://mathieu3446.github.io/obsidian-gsync-personal/callback.html

5. Cette adresse va dans les **URI de redirection**, pas dans les origines JavaScript.
6. Crée le client. Conserve son **Client ID** et son **Client secret** dans ton gestionnaire de mots de passe.

Pour cette implémentation, réutilise ce même client sur tes deux appareils.

Référence : [création des identifiants OAuth](https://developers.google.com/workspace/guides/create-credentials).

### 3.5 Vérifier la page de retour

Ouvre l’URL ci-dessus dans le navigateur. Une page **GSync Personal** doit t’inviter à commencer depuis Obsidian : c’est normal, ouvrir la page seule ne connecte rien.

GitHub Pages est déjà activé pour ce dépôt. Cette page recevra un code temporaire de connexion, pas les notes ni les identifiants durables sauvegardés par le plugin.

### 3.6 Comprendre le mode Test

Pour cet usage, une application OAuth externe en **Testing** reçoit des jetons de renouvellement expirant après **sept jours**. Une reconnexion peut donc être nécessaire. Ce n’est pas ta phrase secrète locale qui expire. [Explication Google](https://developers.google.com/identity/protocols/oauth2/)

Après les essais, tu peux examiner **Audience → Publier l’application / In production**. Les exigences éventuelles dépendent de Google et du compte. Ce changement ne publie pas ton plugin dans le catalogue Obsidian. Le mode Test suffit pour commencer.

## 4. Installer le plugin sur PC

### 4.1 Télécharger le ZIP installable

1. Ouvre la [release 2.1.1](https://github.com/mathieu3446/obsidian-gsync-personal/releases/tag/2.1.1).
2. Dans **Assets**, télécharge **gsync-personal-2.1.1.zip**.
3. N’utilise pas **Source code (zip)** : c’est le projet de développement.
4. Clic droit sur le ZIP → **Extraire tout**.

Tu dois obtenir **main.js**, **manifest.json** et **LICENSE**. Il n’y a pas de fichier styles.css dans cette version.

### 4.2 Copier les fichiers dans le coffre

1. Ferme Obsidian.
2. Ouvre le dossier du coffre de test dans l’Explorateur Windows.
3. Repère **.obsidian**. Si besoin, active **Afficher → Afficher → Éléments masqués**.
4. Si ce dossier n’existe pas, ouvre une fois le coffre dans Obsidian, puis referme l’application.
5. Dans **.obsidian**, crée **plugins** s’il manque.
6. Dans **plugins**, crée **gsync-personal**.
7. Copie les trois fichiers extraits directement dedans.

Structure attendue :

    GSync-Test/
      .obsidian/
        plugins/
          gsync-personal/
            main.js
            manifest.json
            LICENSE

Pas de sous-dossier supplémentaire entre **gsync-personal** et les fichiers. Si tu as volontairement personnalisé le nom du dossier de configuration Obsidian, utilise ce nom à la place de .obsidian.

### 4.3 Activer

1. Relance Obsidian dans le coffre de test.
2. Va dans **Paramètres → Extensions communautaires / Community plugins**.
3. Si nécessaire, autorise les extensions communautaires en quittant le mode restreint d’Obsidian.
4. Active **GSync Personal** et vérifie la version **2.1.1**.
5. Ouvre ses paramètres.

Référence : [installation manuelle, projet exemple officiel Obsidian](https://github.com/obsidianmd/obsidian-sample-plugin#manually-installing-the-plugin).

## 5. Connecter le PC et créer la destination Drive

### 5.1 Enregistrer les identifiants

Dans **Paramètres → GSync Personal** :

1. Colle le client ID dans **New OAuth client ID**.
2. Colle le client secret dans **Client secret**.
3. Dans **Encryption passphrase**, choisis une phrase secrète locale d’au moins **14 caractères**. Conserve-la dans ton gestionnaire de mots de passe.
4. Clique **Save credentials** et attends la fin de l’opération.

Ne mets pas ton mot de passe Google dans ces champs : la phrase secrète protège localement les identifiants du plugin.

### 5.2 Connecter Google

1. Clique **Sign in with Google**.
2. Si un message dit que le lien est en préparation, attends un instant puis clique à nouveau.
3. Choisis dans le navigateur le même compte que l’utilisateur test ajouté dans Google Cloud.
4. Vérifie le nom de ton application et les permissions avant d’autoriser.
5. Sur la page de retour, clique **Revenir à Obsidian** et autorise l’ouverture d’Obsidian si demandé.
6. Reviens dans le coffre qui a lancé la connexion.

Résultat attendu : **Unlocked • Google connected**.

Si Google bloque, consulte le dépannage. N’autorise pas une application ou un domaine inattendu.

### 5.3 Créer la destination, sur le PC uniquement

1. Laisse **Auto-sync interval (minutes)** à **0** pour les essais.
2. Garde **Dedicated folder name** à **Obsidian Personal**, ou choisis un nom simple sans barre oblique.
3. Si tu changes le nom, clique **Save settings** avant de créer la destination.
4. Clique **Create new destination**, dans **First device only: create destination**.
5. Attends la fin.
6. Copie l’identifiant affiché dans **Bound folder ID** : il servira pour l’iPhone.

Le plugin crée un dossier dans **Mon Drive**, avec un suffixe unique. **Ne crée pas ce dossier manuellement sur le site Drive** : le plugin doit y placer son propre marqueur.

Une seule création pour le couple PC/iPhone. Le même nom sur deux dossiers ne signifie pas la même destination : c’est l’ID qui compte.

### 5.4 Premier envoi

1. Clique **Sync** dans **Sync now**.
2. Attends le bilan et vérifie qu’il ne contient pas d’erreur.
3. Ouvre [Google Drive](https://drive.google.com/) dans le navigateur.
4. Dans **Mon Drive**, ouvre le dossier créé et vérifie tes notes de test.

Le dossier n’a pas besoin d’être partagé publiquement. Ne convertis pas les fichiers Markdown en Google Docs : les documents Google natifs ne sont pas pris en charge par le plugin.

## 6. Installer sur iPhone avec BRAT

### 6.1 Créer le coffre local

1. Installe Obsidian depuis l’App Store et ouvre-le.
2. Choisis **Créer un coffre / Create new vault**.
3. Nomme-le, par exemple **GSync-Test-iPhone**.
4. Désactive **Stocker dans iCloud / Store in iCloud** pour ce coffre : GSync Personal assurera les transferts.
5. Crée le coffre, vide pour ce premier essai.

Ne choisis pas un dossier de l’application Google Drive comme coffre. Le plugin relie les copies locales.

### 6.2 Installer BRAT

1. Ouvre **Paramètres → Extensions communautaires** dans Obsidian.
2. Autorise les extensions communautaires si le mode restreint est actif.
3. Appuie sur **Parcourir / Browse**.
4. Recherche **BRAT**, du développeur **TfTHacker** ; le nom peut aussi inclure **Obsidian42**.
5. Installe-le, puis active-le.

### 6.3 Installer GSync Personal

1. Ouvre les paramètres de BRAT.
2. Choisis **Add beta plugin / Add plugin**. Autre accès : la palette de commandes → **BRAT: Add a beta plugin for testing**.
3. Colle ce dépôt :

    mathieu3446/obsidian-gsync-personal

4. Si une version est demandée, sélectionne **2.1.1**. L’installation à partir d’un tag permet de figer cette version pendant tes essais.
5. Appuie sur **Add Plugin** et attends la confirmation.
6. Retourne dans **Extensions communautaires**, actualise la liste si nécessaire, puis active **GSync Personal**.
7. Vérifie la version **2.1.1**.

La release nécessaire est publiée. Aucun jeton GitHub personnel n’est nécessaire pour ce dépôt public. BRAT installe le plugin ; il ne synchronise pas tes notes.

Référence : [guide de l’auteur de BRAT](https://tfthacker.com/brat-quick-guide).

## 7. Connecter l’iPhone au même dossier

1. Ouvre **Paramètres → GSync Personal** sur l’iPhone.
2. Entre le **même client ID et le même client secret** que sur le PC.
3. Choisis une phrase secrète locale d’au moins 14 caractères ; elle peut différer de celle du PC.
4. Appuie sur **Save credentials**, puis **Sign in with Google**.
5. Choisis le **même compte Google** que sur le PC.
6. Termine l’autorisation, puis **Revenir à Obsidian** ; confirme l’ouverture de l’application si demandé.
7. Vérifie **Unlocked • Google connected**.
8. **Après cette connexion**, colle l’ID copié sur PC dans **Bound folder ID**.
9. Laisse l’intervalle automatique à **0**, puis appuie sur **Save settings**.
10. **N’appuie pas sur Create new destination sur l’iPhone** : il réutilise le dossier PC.
11. Appuie sur **Sync**. Laisse Obsidian ouvert, écran allumé, jusqu’au bilan.

Résultat attendu : les notes de test envoyées depuis PC apparaissent sur l’iPhone.

Important : une nouvelle connexion Google réinitialise le lien de destination dans cette version. Renseigne donc le **Bound folder ID après la connexion**, puis enregistre. Une simple opération **Unlock** après redémarrage ne demande pas de refaire tout cela.

Le texte d’aide du champ ID peut mentionner un remplissage après synchronisation : dans la version 2.1.1, sur le premier appareil, il est rempli à la **création de destination**.

Si iOS ferme Obsidian pendant la connexion, recommence depuis **Sign in with Google**. Les éléments temporaires de connexion restent seulement en mémoire.

## 8. Tester la synchronisation

Commence avec quelques fichiers jetables et lance les synchronisations **une après l’autre**.

| Essai | Actions | Résultat attendu |
|---|---|---|
| PC → iPhone | Crée Test-PC.md ; Sync PC, puis Sync iPhone | La note arrive avec son contenu |
| iPhone → PC | Crée Test-iPhone.md ; Sync iPhone, puis Sync PC | La note arrive sur PC |
| Modification PC | Ajoute une phrase ; Sync PC, puis iPhone | La phrase arrive sans erreur |
| Modification iPhone | Ajoute une autre phrase ; Sync iPhone, puis PC | Les deux phrases sont présentes |
| Pièce jointe | Ajoute une petite image sur PC ; synchronise les deux | L’image est disponible sur iPhone |
| Redémarrage | Ferme complètement Obsidian, rouvre et lance Sync | Le plugin exige le déverrouillage avant la synchronisation |

Teste ensuite un conflit sur **une note jetable déjà synchronisée** : modifie-la différemment sur les deux appareils, sans synchroniser entre les modifications. Synchronise ensuite un appareil, puis l’autre. Vérifie qu’une copie **(conflict …)** conserve l’autre contenu.

Si le comportement diffère, conserve les fichiers et le message d’erreur avant de poursuivre.

**Une erreur ETag ou une mise à jour refusée signifie que le test n’est pas validé**, même si l’envoi initial a fonctionné. Ne contourne pas la protection en retirant le contrôle dans le code.

Après validation, migre tes vraies notes par petits lots depuis le coffre PC, sans écraser la sauvegarde indépendante. Garde les configurations et anciens moteurs de synchronisation hors de cette migration.

## 9. Utilisation quotidienne et réglages

### Routine

1. Ouvre Obsidian.
2. Si nécessaire : paramètres GSync Personal → **Passphrase → Unlock**.
3. Lance **Sync avant de modifier** pour récupérer les changements.
4. Travaille sur tes notes.
5. Lance **Sync avant de changer d’appareil**, puis attends la fin.
6. Sur iPhone, garde Obsidian au premier plan pendant l’opération.

Une minuterie ne garantit pas la synchronisation en arrière-plan sur iOS.

### Réglages

| Champ | Départ conseillé | Effet |
|---|---|---|
| Auto-sync interval (minutes) | 0 pour tester, éventuellement 10 ensuite | Minuterie après déverrouillage ; 0 désactive |
| Maximum file size (MB) | 25, éventuellement 10 sur iPhone | Les fichiers plus gros sont ignorés |
| Allowed extensions | Liste d’origine | Seuls ces formats sont transférés |
| Excluded paths | Vide au départ | Une règle par ligne : fichier, dossier/ ou *.extension |
| Your static sign-in page | URL GitHub Pages du guide | Doit correspondre exactement à Google Cloud |
| Bound folder ID | Identique sur les appareils | Destination réelle ; ne pas l’effacer pour contourner une erreur |

Les formats initiaux incluent md, txt, canvas, pdf et plusieurs formats d’images/audio/vidéo. Les fichiers cachés et le dossier de configuration sont exclus. **Les plugins, réglages, thèmes et identifiants ne se synchronisent pas.**

Les fichiers Google Docs/Sheets/Slides sont ignorés. Les noms incompatibles avec Windows et les doublons peuvent bloquer le parcours distant. Les changements distants de binaires existants produisent des copies de conflit à examiner manuellement.

### Suppressions et renommages

Cette version ne propage **aucune suppression automatique**. Un fichier supprimé uniquement sur un appareil peut revenir de Drive. Un renommage peut laisser revenir l’ancien nom.

Pour supprimer définitivement un fichier : termine les opérations, mets l’intervalle à 0 sur tous les appareils et ferme Obsidian ; retire ensuite le fichier des deux coffres locaux et de la destination Drive avant de reprendre. Conserve une sauvegarde si nécessaire. Les copies de récupération peuvent encore contenir ce fichier.

Renommer ou déplacer le dossier Drive ne change pas son ID. S’il devient inaccessible ou part à la corbeille, le plugin s’arrête : restaure d’abord la destination attendue au lieu d’en créer une autre.

## 10. Dépannage

| Symptôme | Action |
|---|---|
| Plugin absent sur PC | Vérifie le bon coffre, le chemin exact, main.js et manifest.json sans double sous-dossier ; redémarre Obsidian |
| BRAT refuse le dépôt | Utilise le nom exact du dépôt et 2.1.1 ; vérifie Internet et la release. Attends si GitHub impose une limite temporaire |
| Plugin verrouillé | **Passphrase → Unlock** avec la phrase secrète de cet appareil |
| Mauvaise phrase secrète | Vérifie le mot de passe local, pas le mot de passe Google ; voir section 11 s’il est perdu |
| redirect_uri_mismatch | Vérifie le client Application Web et l’URI exacte dans Google Cloud et dans le plugin, sans espace ni barre finale ajoutée |
| access_denied / accès bloqué | Vérifie utilisateur test, compte choisi, audience et règles de l’organisation |
| Permission upgrade required / Full Drive access required | Mets à jour tous les appareils, reconnecte-toi via Sign in again avec la permission drive, puis remets le dossier ID |
| Pas de retour dans Obsidian | Appuie sur Revenir à Obsidian et ouvre le coffre qui a lancé la connexion ; si l’app a été arrêtée, recommence |
| Lien de connexion en préparation | Attends un instant puis appuie à nouveau sur Sign in with Google |
| No destination bound | Crée la destination sur le premier appareil seulement ; ailleurs colle son ID après connexion, puis Save settings |
| Bound folder unavailable / 404 | Vérifie compte, client OAuth, ID et corbeille Drive ; restaure la destination si nécessaire |
| Erreur Google 403 | Vérifie Google Drive API dans le bon projet ; une règle d’organisation ou un quota peut aussi être en cause |
| invalid_grant après environ sept jours | Possible expiration du mode Test. Reconnecte Google puis remets le bon dossier ID ; examine le statut de publication Google |
| Deux destinations séparées | Arrête les syncs, conserve les fichiers des deux dossiers et compare les IDs avant de choisir la destination commune |
| Fichiers skipped | Vérifie taille, formats et exclusions : ils ne sont pas forcément transférés |
| Doublon / collision de casse | Sauvegarde les variantes, par exemple Note.md et note.md, puis donne-leur des noms distincts |
| ETag absent / mise à jour refusée | Arrête les essais sur données importantes ; relève le message pour diagnostiquer l’intégration réelle |
| Local note changed during download | Attends l’enregistrement et relance sans modifier la note pendant le transfert |
| Copies conflict | Compare et combine les contenus avant de supprimer ; les binaires peuvent nécessiter un choix manuel |
| iPhone interrompu | Garde Obsidian ouvert, écran allumé ; réduis le nombre/taille des fichiers et vérifie le bilan |

Pour demander de l’aide : indique version du plugin, Windows/iOS, étape et message d’erreur. Masque les secrets, adresses personnelles et contenus privés. **Ne partage jamais data.json.**

## 11. Sauvegarde, récupération et déconnexion

### Sauvegarde indépendante

Avant migration ou mise à jour, termine les transferts, ferme Obsidian et copie le coffre PC à un autre emplacement, hors de la destination synchronisée par le plugin. Drive et l’autre appareil ne suffisent pas : une mauvaise modification peut aussi être recopiée.

### Copies de récupération

Le dossier **.gsync-personal-backups/** est à la racine du coffre de l’appareil ayant créé les copies.

Sur PC :

1. Arrête les synchronisations et sauvegarde ce dossier.
2. Ouvre un fichier **.json** : il indique le chemin d’origine et la date.
3. Retrouve le **.bin** qui possède exactement le même nom de base.
4. Copie ce .bin ailleurs, puis renomme la **copie** avec l’extension appropriée, par exemple note-recuperee.md.
5. Vérifie le contenu avant toute restauration.

Il peut s’agir d’une ancienne version locale ou distante. Les copies restent **en clair**, ne sont pas synchronisées par le plugin et ne sont pas purgées automatiquement : surveille leur taille. Sur iPhone, le dossier caché peut demander un outil capable d’y accéder ; ne suppose pas que ces copies ont aussi été envoyées au PC.

### Lock ou Revoke and disconnect

- **Lock** : verrouille les identifiants en mémoire ; la phrase secrète locale permet de reprendre. Attends la fin des opérations avant de verrouiller.
- **Revoke and disconnect** : demande à Google de retirer l’autorisation ; d’autres appareils qui la partagent peuvent devoir se reconnecter.

Pour retirer l’accès directement chez Google, utilise les [autorisations du compte](https://myaccount.google.com/permissions), repère ton application dédiée et supprime sa connexion.

### Phrase secrète perdue

1. Conserve tes notes et relève le Bound folder ID.
2. Révoque l’autorisation Google.
3. Sur PC, désactive le plugin et ferme Obsidian.
4. Mets de côté **.obsidian/plugins/gsync-personal/data.json** dans un emplacement privé sauvegardé. Il contient paramètres et identifiants chiffrés, pas les notes.
5. Réactive le plugin et reconfigure les identifiants avec une nouvelle phrase secrète.
6. Reconnecte Google, puis remets le bon dossier ID et enregistre avant Sync.
7. Vérifie les autres appareils après la révocation.

Sur iPhone, si tu dois réinstaller le plugin faute d’accès au fichier caché, sauvegarde d’abord ce qui doit l’être et relève le dossier ID. **Ne supprime pas le coffre ni l’application Obsidian pour réinitialiser seulement ce plugin.**

Les anciennes sauvegardes du data.json de l’ancien GSync peuvent contenir des jetons en clair : révoque aussi cette ancienne autorisation si elle existe.

### Mises à jour

- **PC manuel** : sauvegarde, ferme Obsidian, remplace main.js et manifest.json par ceux d’une même nouvelle release, puis redémarre. Conserve le data.json privé sauf instruction de migration spécifique.
- **iPhone BRAT** : utilise sa recherche de mises à jour. Si tu as figé 2.1.1, change explicitement de version quand tu souhaites mettre à jour.

## 12. Checklist finale

- [ ] Sauvegarde indépendante du coffre disponible.
- [ ] Coffres locaux PC/iPhone et un seul moteur de synchronisation pour ces coffres.
- [ ] Google Drive API activée dans le projet dédié.
- [ ] Compte ajouté comme utilisateur test si nécessaire.
- [ ] Client Application Web et URL de redirection exacte.
- [ ] Permission étendue drive autorisée après mise à jour de tous les appareils.
- [ ] GSync Personal 2.1.1 activé sur les deux appareils.
- [ ] Même compte Google et même client ID/client secret.
- [ ] Phrases secrètes conservées dans un gestionnaire de mots de passe.
- [ ] Destination créée explicitement sur un seul appareil.
- [ ] Même Bound folder ID enregistré après connexion sur PC/iPhone.
- [ ] Tests de création, modification et pièces jointes effectués dans les deux sens.
- [ ] Aucune erreur de transfert ignorée ; fichiers skipped et conflits examinés.
- [ ] Déverrouillage après redémarrage testé.
- [ ] Aucun secret, jeton ou data.json publié ou placé dans les notes synchronisées.

**Ordre à retenir : Google Cloud → installation PC → connexion PC → création de destination → Sync PC → installation iPhone via BRAT → connexion iPhone → copie de l’ID → Sync iPhone → tests dans les deux sens.**

