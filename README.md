# kiubi-sync

[![npm](https://img.shields.io/npm/v/kiubi-sync)](https://www.npmjs.com/package/kiubi-sync)
[![license](https://img.shields.io/npm/l/kiubi-sync)](LICENSE)
[![tests](https://github.com/Kiubi/kiubi-sync/actions/workflows/test.yml/badge.svg)](https://github.com/Kiubi/kiubi-sync/actions/workflows/test.yml)
[![coverage](https://codecov.io/gh/Kiubi/kiubi-sync/graph/badge.svg)](https://codecov.io/gh/Kiubi/kiubi-sync)

> Aide à la publication de thème graphique personnalisé sur Kiubi.

## Installation

Installation avec [npm](https://www.npmjs.com/):

```sh
$ npm install --save-dev kiubi-sync
```

## Utilisation avec Gulp

```js
const { watch } = require('gulp');
const ftpWrapper = require('kiubi-sync');

const ftp = new ftpWrapper({
	user: 'MY-USER',
	password: 'MY-PASSWORD',
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

exports.deploy = deployTask;

exports.pull = pullTask;
```

## Options

* `user` **{String}**: Identifiant FTP
* `password` **{String}**: Mot de passe FTP
* `localDir` **{String}**: Dossier local du thème, relatif au répertoire courant ou absolu. Par défaut `theme`.
* `host` **{String}**: Serveur FTP. Par défaut `ftp.kiubi-web.com`.
* `port` **{Number}**: Port FTP. Par défaut `21`.

Le dossier local correspond toujours au dossier `theme` du serveur FTP Kiubi. Pour travailler dans un autre dossier local :

```js
const ftp = new ftpWrapper({
	user: 'MY-USER',
	password: 'MY-PASSWORD',
	localDir: 'src/mon-theme',
});

ftp.watch(watch('src/mon-theme/**', { events: 'all' }));
```

Les fichiers et dossiers cachés (`.git`, `.DS_Store`…) et les fichiers `.LCK` sont toujours ignorés.

## API

### [watch](index.js#L148)

Surveille et publie les modifications locales des fichiers du thème graphique.

**Params**

* `watcher` **{chokidar}**: Instance de chokidar

**Example**

```js
ftp.watch(gulp.watch('theme/**', { events: 'all' }));
```

Les événements portant sur des fichiers hors du dossier local sont ignorés.

### [pullAll](index.js#L168)

Rapatrie en local tous les fichiers du thème graphique. Les fichiers inchangés (même taille, même date de modification) ne sont pas retéléchargés.

**Params**

* `path` **{String}**: Optionnel. Sous-dossier du dossier local à rapatrier. Par défaut tout le dossier local.
* `options` **{Object}**: Optionnel.
  * `skipFiles` **{String[]}**: Extensions à ignorer, par exemple `['pdf']`
  * `skipSize` **{Number}**: Taille en octets à partir de laquelle un fichier est ignoré

**Return**

* **{Promise<void>}**

**Example**

```js
ftp.pullAll();
ftp.pullAll({ skipFiles: ['pdf'], skipSize: 1048576 });
ftp.pullAll('theme/fr/assets');
```

### [pushAll](index.js#L184)

Publie tous les fichiers du thème graphique.

**Params**

* `path` **{String}**: Optionnel. Sous-dossier du dossier local à publier. Par défaut tout le dossier local.

**Return**

* **{Promise<void>}**

**Example**

```js
ftp.pushAll();
ftp.pushAll('theme/fr/assets');
```

## À propos

### Contribution

Pull requests et stars sont les bienvenues. Pour les bugs et les requêtes de fonctionnalités, [merci d'ouvrir un rapport de bug](../../issues/new).

### License

Copyright © 2020, [Kiubi](https://www.kiubi.com).
Released under the [MIT License](LICENSE).
