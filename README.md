# kiubi-sync

[![npm](https://img.shields.io/npm/v/kiubi-sync)](https://www.npmjs.com/package/kiubi-sync)
[![license](https://img.shields.io/npm/l/kiubi-sync)](https://github.com/Kiubi/kiubi-sync/blob/master/LICENSE)
[![tests](https://github.com/Kiubi/kiubi-sync/actions/workflows/test.yml/badge.svg)](https://github.com/Kiubi/kiubi-sync/actions/workflows/test.yml)
[![coverage](https://codecov.io/gh/Kiubi/kiubi-sync/graph/badge.svg)](https://codecov.io/gh/Kiubi/kiubi-sync)

> Aide à la publication de thème graphique personnalisé sur Kiubi.

[Kiubi](https://www.kiubi.com) est une solution de création de sites internet et de boutiques en ligne. Les thèmes graphiques personnalisés y sont déposés par FTP, dans le dossier `theme` du site.

`kiubi-sync` synchronise ce dossier avec un dossier local, depuis des tâches [Gulp](https://gulpjs.com) :

* **pull** : rapatrie le thème du serveur en local ;
* **push** : publie tout le thème local sur le serveur ;
* **watch** : publie au fil de l'eau chaque fichier modifié, ajouté ou supprimé en local.

## Prérequis

* Node.js 18 ou plus récent ;
* les identifiants FTP de votre site Kiubi ;
* Gulp (ou tout autre outil fournissant un watcher [chokidar](https://github.com/paulmillr/chokidar)), à installer séparément.

## Installation

```sh
npm install --save-dev kiubi-sync gulp
```

## Utilisation avec Gulp

Rangez les identifiants FTP dans un fichier `config.json`, à ne jamais committer :

```json
{
	"user": "kiubi-SITE_CODE",
	"password": "MOT-DE-PASSE"
}
```

```sh
echo config.json >> .gitignore
```

Puis dans `gulpfile.js` :

```js
const { watch } = require('gulp');
const ftpWrapper = require('kiubi-sync');
const config = require('./config.json');

const ftp = new ftpWrapper({
	user: config.user,
	password: config.password,
});

function watchTask() {
	ftp.watch(watch('theme/**', { events: 'all' }));
}

function pullTask() {
	return ftp.pullAll();
}

function deployTask() {
	return ftp.pushAll();
}

exports.watch = watchTask;
exports.pull = pullTask;
exports.deploy = deployTask;
```

Les variables d'environnement (`process.env.KIUBI_FTP_PASSWORD`…) conviennent aussi. Un exemple complet, avec minification des JS et CSS, se trouve dans le dossier [`example`](https://github.com/Kiubi/kiubi-sync/tree/master/example).

## Options

* `user` **{String}** : identifiant FTP.
* `password` **{String}** : mot de passe FTP.
* `localDir` **{String}** : dossier local du thème, relatif au répertoire courant ou absolu. Par défaut `theme`.
* `host` **{String}** : serveur FTP. Par défaut `ftp.kiubi-web.com`.
* `port` **{Number}** : port FTP. Par défaut `21`.

Le dossier local correspond toujours au dossier `theme` du serveur FTP Kiubi. Pour travailler dans un autre dossier local :

```js
const ftp = new ftpWrapper({
	user: config.user,
	password: config.password,
	localDir: 'src/mon-theme',
});

ftp.watch(watch('src/mon-theme/**', { events: 'all' }));
```

## Comportement

* **Le watch propage les suppressions** : supprimer un fichier ou un dossier en local le supprime aussi sur le serveur.
* `pushAll` ne supprime rien sur le serveur : un fichier distant absent en local y reste.
* `pullAll` ne supprime rien en local : un fichier local absent du serveur reste en place. Les fichiers locaux modifiés sont en revanche écrasés par la version du serveur.
* Les fichiers et dossiers cachés (`.git`, `.DS_Store`…) et les fichiers `.LCK` sont toujours ignorés, dans les deux sens.
* Les chemins passés aux méthodes sont relatifs au répertoire courant (ou absolus), et doivent se trouver dans le dossier local. Les autres sont refusés, et ignorés par le watch.
* `pullAll` et `pushAll` affichent les erreurs dans la console, mais leur promesse est toujours résolue : elles ne font pas échouer la tâche Gulp.

## API

### watch

Surveille et publie les modifications locales des fichiers du thème graphique. La connexion FTP reste ouverte tant que le watcher tourne.

**Params**

* `watcher` **{chokidar}** : instance de chokidar, par exemple renvoyée par `gulp.watch()`.

**Example**

```js
ftp.watch(gulp.watch('theme/**', { events: 'all' }));
```

### pullAll

Rapatrie en local tous les fichiers du thème graphique. Les fichiers inchangés (même taille, même date de modification) ne sont pas retéléchargés. La connexion est fermée à la fin.

**Params**

* `path` **{String}** : optionnel. Sous-dossier du dossier local à rapatrier, par exemple `theme/fr/assets`. Par défaut tout le dossier local.
* `options` **{Object}** : optionnel.
  * `skipFiles` **{String[]}** : extensions à ignorer, par exemple `['pdf']`.
  * `skipSize` **{Number}** : taille en octets à partir de laquelle un fichier est ignoré.

**Return**

* **{Promise<void>}**

**Example**

```js
ftp.pullAll();
ftp.pullAll({ skipFiles: ['pdf'], skipSize: 1048576 });
ftp.pullAll('theme/fr/assets');
```

### pushAll

Publie tous les fichiers du thème graphique. La connexion est fermée à la fin.

**Params**

* `path` **{String}** : optionnel. Sous-dossier du dossier local à publier, par exemple `theme/fr/assets`. Par défaut tout le dossier local.

**Return**

* **{Promise<void>}**

**Example**

```js
ftp.pushAll();
ftp.pushAll('theme/fr/assets');
```

### ftpPut

Publie un seul fichier local, en créant les dossiers distants si besoin. La connexion reste ouverte : appeler `close()` ensuite.

**Params**

* `path` **{String}** : fichier local, par exemple `theme/theme.xml`.

**Return**

* **{Promise<void>}** : rejetée avec le message d'erreur si la publication échoue.

**Example**

```js
await ftp.ftpPut('theme/theme.xml');
ftp.close();
```

### ftpRemove

Supprime un fichier sur le serveur. Un fichier déjà absent n'est pas une erreur. La connexion reste ouverte : appeler `close()` ensuite.

**Params**

* `path` **{String}** : chemin local correspondant, par exemple `theme/fr/assets/old.css`.

**Return**

* **{Promise<void>}** : rejetée avec le message d'erreur si la suppression échoue.

### ftpRmdir

Supprime un dossier et tout son contenu sur le serveur. La connexion reste ouverte : appeler `close()` ensuite.

> Appelé avec le dossier local lui-même (`theme`), `ftpRmdir` supprime tout le thème distant.

**Params**

* `path` **{String}** : chemin local correspondant, par exemple `theme/fr/assets/old`.

**Return**

* **{Promise<void>}** : rejetée avec le message d'erreur si la suppression échoue.

### close

Ferme la connexion FTP si elle est ouverte. Inutile après `pullAll` et `pushAll`, qui la ferment eux-mêmes.

**Example**

```js
ftp.close();
```

## À propos

### Contribution

Les contributions sont les bienvenues. Pour signaler un bug ou proposer une fonctionnalité, [ouvrez une issue](https://github.com/Kiubi/kiubi-sync/issues/new).

### Licence

Copyright © 2020-2026, [Kiubi](https://www.kiubi.com).
Publié sous [licence MIT](https://github.com/Kiubi/kiubi-sync/blob/master/LICENSE).
