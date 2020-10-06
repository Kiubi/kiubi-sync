# kiubi-sync

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
	return ftp.pullAll('theme');
}

function deployTask() {
	return ftp.pushAll('theme');
}

exports.watch = watchTask;

exports.deploy = deployTask;

exports.pull = pullTask;
```

## API

### [watch](index.js#L163)

Surveille et publie les modifications des fichiers du thème graphique en local.

**Params**

* `watcher` **{chokidar}**: Instance de chokidar

**Example**

```js
ftp.watch(gulp.watch('theme/**', { events: 'all' }));
```

### [pullAll](index.js#L180)

Surveille et publie les modifications des fichiers du thème graphique en local.

**Params**

* `path` **{String}**: Chemin

**Return**

* **{Promise<void>}**

**Example**

```js
ftp.pullAll('theme');
```

### [pushAll](index.js#L192)

Surveille et publie les modifications des fichiers du thème graphique en local.

**Params**

* `path` **{String}**: Chemin

**Return**

* **{Promise<void>}**

**Example**

```js
ftp.pushAll('theme');
```

## À propos

### Contribution

Pull requests et stars sont les bienvenues. Pour les bugs et les requêtes de fonctionnalités, [merci d'ouvrir un rapport de bug](../../issues/new).

### License

Copyright © 2020, [Kiubi](https://www.kiubi.com).
Released under the [MIT License](LICENSE).
