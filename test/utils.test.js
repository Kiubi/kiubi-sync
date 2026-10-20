const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('path');
const { mkdtempSync, rmSync, statSync } = require('fs');
const { tmpdir } = require('os');

const { toFtpPath, isForbiddenFilename, isForbiddenPath, ensureLocalDirectory } = require('../src/utils');

describe('toFtpPath', () => {

	it('préfixe le chemin par /', () => {
		assert.equal(toFtpPath('theme'), '/theme');
	});

	it('convertit les séparateurs locaux en séparateurs POSIX', () => {
		assert.equal(toFtpPath(join('theme', 'fr', 'assets', 'style.css')), '/theme/fr/assets/style.css');
	});

});

describe('isForbiddenFilename', () => {

	it('refuse les fichiers cachés', () => {
		assert.equal(isForbiddenFilename('.DS_Store'), true);
		assert.equal(isForbiddenFilename('.htaccess'), true);
	});

	it('refuse les fichiers de verrou .LCK', () => {
		assert.equal(isForbiddenFilename('index.html.LCK'), true);
	});

	it('accepte les fichiers ordinaires', () => {
		assert.equal(isForbiddenFilename('style.css'), false);
		assert.equal(isForbiddenFilename('theme.xml'), false);
		assert.equal(isForbiddenFilename('LCK.txt'), false);
	});

});

describe('isForbiddenPath', () => {

	it('refuse un fichier interdit', () => {
		assert.equal(isForbiddenPath('theme/fr/.DS_Store'), true);
		assert.equal(isForbiddenPath('theme/fr/index.html.LCK'), true);
	});

	it('refuse tout ce qui se trouve dans un dossier interdit', () => {
		assert.equal(isForbiddenPath('theme/.git/config'), true);
		assert.equal(isForbiddenPath('theme/fr/.vscode/settings/a.json'), true);
		assert.equal(isForbiddenPath('theme/.cache'), true);
	});

	it('gère les séparateurs Windows', () => {
		assert.equal(isForbiddenPath('theme\\.git\\config'), true);
		assert.equal(isForbiddenPath('theme\\fr\\style.css'), false);
	});

	it('accepte les chemins ordinaires, y compris relatifs', () => {
		assert.equal(isForbiddenPath('theme/fr/assets/style.css'), false);
		assert.equal(isForbiddenPath('./theme/fr/style.css'), false);
		assert.equal(isForbiddenPath('../site/theme/style.css'), false);
	});

});

describe('ensureLocalDirectory', () => {

	let root;

	before(() => {
		root = mkdtempSync(join(tmpdir(), 'kiubi-sync-'));
	});

	after(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('crée une arborescence imbriquée', async () => {
		const path = join(root, 'a', 'b', 'c');
		await ensureLocalDirectory(path);
		assert.equal(statSync(path).isDirectory(), true);
	});

	it('ne fait rien si le répertoire existe déjà', async () => {
		const path = join(root, 'existant');
		await ensureLocalDirectory(path);
		await ensureLocalDirectory(path);
		assert.equal(statSync(path).isDirectory(), true);
	});

});
