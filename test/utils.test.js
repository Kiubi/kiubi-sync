const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('path');
const { mkdtempSync, rmSync, statSync } = require('fs');
const { tmpdir } = require('os');

const { toFtpPath, isForbiddenFilename, ensureLocalDirectory } = require('../src/utils');

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
