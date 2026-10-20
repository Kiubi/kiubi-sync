const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { join, dirname, relative, sep, posix } = require('path');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, utimesSync, rmSync } = require('fs');
const { tmpdir } = require('os');

const ftpWrapper = require('../../index');
const { startFtpServer } = require('../helpers/ftpServer');

/**
 * Create files from a { 'relative/path': content } map
 *
 * @param {String} root
 * @param {Object} files
 */
function writeTree(root, files) {
	for (const [path, content] of Object.entries(files)) {
		const fullPath = join(root, path);
		mkdirSync(dirname(fullPath), { recursive: true });
		writeFileSync(fullPath, content);
	}
}

/**
 * Read all files below a directory as a { 'relative/path': content } map
 *
 * @param {String} root
 * @returns {Object}
 */
function readTree(root) {
	const files = {};
	const walk = (dir) => {
		for (const name of readdirSync(dir)) {
			const fullPath = join(dir, name);
			if (statSync(fullPath).isDirectory()) {
				walk(fullPath);
			}
			else {
				files[relative(root, fullPath).split(sep).join(posix.sep)] = readFileSync(fullPath, 'utf8');
			}
		}
	};
	walk(root);
	return files;
}

describe('synchronisation avec un serveur FTP', () => {

	const initialCwd = process.cwd();
	let workspace;
	let remoteDir;
	let localDir;
	let server;
	let log;

	beforeEach(async (t) => {
		workspace = mkdtempSync(join(tmpdir(), 'kiubi-sync-'));
		remoteDir = join(workspace, 'remote');
		localDir = join(workspace, 'local');
		mkdirSync(remoteDir);
		mkdirSync(localDir);

		server = await startFtpServer(remoteDir);

		// ftpWrapper travaille avec des chemins relatifs au répertoire courant
		process.chdir(localDir);

		log = t.mock.method(console, 'log', () => {});
	});

	afterEach(async () => {
		process.chdir(initialCwd);
		await server.close();
		rmSync(workspace, { recursive: true, force: true });
	});

	function createWrapper() {
		return new ftpWrapper({
			host: server.host,
			port: server.port,
			user: server.user,
			password: server.password,
		});
	}

	/**
	 * pullAll et pushAll affichent les erreurs au lieu de les rejeter
	 */
	function assertNoErrorLogged() {
		const errors = log.mock.calls.filter((call) => String(call.arguments[0]).includes('Erreur'));
		assert.deepEqual(errors.map((call) => call.arguments), []);
	}

	describe('pullAll', () => {

		it('rapatrie toute l\'arborescence du thème', async () => {
			writeTree(remoteDir, {
				'theme/theme.xml': '<theme/>',
				'theme/fr/templates/index.html': '<html></html>',
				'theme/fr/assets/css/style.css': 'body {}',
			});

			await createWrapper().pullAll('theme');

			assertNoErrorLogged();
			assert.deepEqual(readTree(localDir), {
				'theme/theme.xml': '<theme/>',
				'theme/fr/templates/index.html': '<html></html>',
				'theme/fr/assets/css/style.css': 'body {}',
			});
		});

		it('ignore les fichiers interdits', async () => {
			writeTree(remoteDir, {
				'theme/style.css': 'body {}',
				'theme/.DS_Store': 'x',
				'theme/index.html.LCK': 'x',
			});

			await createWrapper().pullAll('theme');

			assertNoErrorLogged();
			assert.deepEqual(Object.keys(readTree(localDir)), ['theme/style.css']);
		});

		it('ignore les extensions listées dans skipFiles', async () => {
			writeTree(remoteDir, {
				'theme/style.css': 'body {}',
				'theme/docs/catalogue.pdf': 'pdf',
				'theme/docs/TARIFS.PDF': 'pdf',
			});

			await createWrapper().pullAll('theme', { skipFiles: ['pdf'] });

			assertNoErrorLogged();
			assert.deepEqual(Object.keys(readTree(localDir)), ['theme/style.css']);
		});

		it('ne confond pas skipFiles avec une extension "undefined"', async () => {
			writeTree(remoteDir, {
				'theme/notes.undefined': 'x',
			});

			await createWrapper().pullAll('theme', { skipFiles: ['pdf'] });

			assertNoErrorLogged();
			assert.deepEqual(Object.keys(readTree(localDir)), ['theme/notes.undefined']);
		});

		it('ignore les fichiers plus gros que skipSize', async () => {
			writeTree(remoteDir, {
				'theme/small.css': 'a'.repeat(10),
				'theme/big.jpg': 'a'.repeat(2000),
			});

			await createWrapper().pullAll('theme', { skipSize: 1000 });

			assertNoErrorLogged();
			assert.deepEqual(Object.keys(readTree(localDir)), ['theme/small.css']);
		});

		it('ne retélécharge pas les fichiers inchangés', async (t) => {
			writeTree(remoteDir, {
				'theme/style.css': 'body {}',
				'theme/fr/index.html': '<html></html>',
			});
			await createWrapper().pullAll('theme');

			const ftp = createWrapper();
			const downloadTo = t.mock.method(ftp.ftpClient, 'downloadTo');
			await ftp.pullAll('theme');

			assertNoErrorLogged();
			assert.equal(downloadTo.mock.callCount(), 0);
		});

		it('retélécharge un fichier modifié sur le serveur', async () => {
			writeTree(remoteDir, {
				'theme/style.css': 'body {}',
			});
			await createWrapper().pullAll('theme');

			// Même taille, date différente
			writeTree(remoteDir, {
				'theme/style.css': 'html {}',
			});
			const later = new Date(Date.now() + 60000);
			utimesSync(join(remoteDir, 'theme/style.css'), later, later);

			await createWrapper().pullAll('theme');

			assertNoErrorLogged();
			assert.equal(readFileSync(join(localDir, 'theme/style.css'), 'utf8'), 'html {}');
		});

	});

	describe('pushAll', () => {

		it('publie toute l\'arborescence du thème', async () => {
			writeTree(localDir, {
				'theme/theme.xml': '<theme/>',
				'theme/fr/templates/index.html': '<html></html>',
				'theme/fr/assets/css/style.css': 'body {}',
			});

			await createWrapper().pushAll('theme');

			assertNoErrorLogged();
			assert.deepEqual(readTree(remoteDir), {
				'theme/theme.xml': '<theme/>',
				'theme/fr/templates/index.html': '<html></html>',
				'theme/fr/assets/css/style.css': 'body {}',
			});
		});

		it('ignore les fichiers interdits', async () => {
			writeTree(localDir, {
				'theme/style.css': 'body {}',
				'theme/.DS_Store': 'x',
				'theme/fr/index.html.LCK': 'x',
			});

			await createWrapper().pushAll('theme');

			assertNoErrorLogged();
			assert.deepEqual(Object.keys(readTree(remoteDir)), ['theme/style.css']);
		});

	});

});
