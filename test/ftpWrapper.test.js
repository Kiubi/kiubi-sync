const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const FTP = require('basic-ftp');

const ftpWrapper = require('../index');

/**
 * Client FTP factice, déjà connecté
 */
function createClient() {
	return {
		closed: false,
		close() {
			this.closed = true;
		},
		trackProgress() {},
		ensureDir: async () => {},
		uploadFrom: async () => {},
		remove: async () => {},
		removeDir: async () => {},
	};
}

function createWrapper(client = createClient()) {
	return new ftpWrapper({ user: 'user', password: 'password', client: client });
}

describe('ftpWrapper', () => {

	beforeEach((t) => {
		t.mock.method(console, 'log', () => {});
	});

	describe('constructor', () => {

		it('utilise les valeurs par défaut', () => {
			const ftp = new ftpWrapper({ user: 'user', password: 'password' });
			assert.equal(ftp.host, 'ftp.kiubi-web.com');
			assert.equal(ftp.port, 21);
			assert.ok(ftp.ftpClient instanceof FTP.Client);
		});

		it('accepte un client FTP injecté', () => {
			const client = createClient();
			assert.equal(createWrapper(client).ftpClient, client);
		});

	});

	describe('watch', () => {

		it('traduit les événements du watcher en commandes FTP', (t) => {
			const ftp = createWrapper();
			const add = t.mock.method(ftp.queue, 'add', () => {});
			const watcher = new EventEmitter();

			ftp.watch(watcher);
			watcher.emit('add', 'theme/new.css');
			watcher.emit('change', 'theme/a.css');
			watcher.emit('unlink', 'theme/b.js');
			watcher.emit('unlinkDir', 'theme/old');

			assert.deepEqual(add.mock.calls.map((call) => call.arguments), [
				['ftpPut', 'theme/new.css'],
				['ftpPut', 'theme/a.css'],
				['ftpRemove', 'theme/b.js'],
				['ftpRmdir', 'theme/old', false],
			]);
		});

		it('ignore les fichiers interdits', (t) => {
			const ftp = createWrapper();
			const add = t.mock.method(ftp.queue, 'add', () => {});
			const watcher = new EventEmitter();

			ftp.watch(watcher);
			watcher.emit('change', 'theme/.DS_Store');
			watcher.emit('add', 'theme/index.html.LCK');
			watcher.emit('unlink', 'theme/.htaccess');

			assert.equal(add.mock.callCount(), 0);
		});

	});

	describe('runCommand', () => {

		it('appelle la commande FTP correspondante', async (t) => {
			const ftp = createWrapper();
			const put = t.mock.method(ftp, 'ftpPut', async () => {});
			const remove = t.mock.method(ftp, 'ftpRemove', async () => {});
			const rmdir = t.mock.method(ftp, 'ftpRmdir', async () => {});

			await ftp.runCommand({ cmd: 'ftpPut', path: 'theme/a.css' });
			await ftp.runCommand({ cmd: 'ftpRemove', path: 'theme/b.js' });
			await ftp.runCommand({ cmd: 'ftpRmdir', path: 'theme/old' });

			assert.deepEqual(put.mock.calls[0].arguments, ['theme/a.css']);
			assert.deepEqual(remove.mock.calls[0].arguments, ['theme/b.js']);
			assert.deepEqual(rmdir.mock.calls[0].arguments, ['theme/old']);
		});

		it('rejette une commande inconnue', async () => {
			await assert.rejects(createWrapper().runCommand({ cmd: 'ftpChmod', path: 'theme/a.css' }));
		});

	});

	describe('ftpPut', () => {

		it('crée le répertoire distant puis envoie le fichier', async (t) => {
			const client = createClient();
			const ensureDir = t.mock.method(client, 'ensureDir');
			const uploadFrom = t.mock.method(client, 'uploadFrom');

			await createWrapper(client).ftpPut('theme/fr/style.css');

			assert.deepEqual(ensureDir.mock.calls[0].arguments, ['/theme/fr']);
			assert.deepEqual(uploadFrom.mock.calls[0].arguments, ['theme/fr/style.css', '/theme/fr/style.css']);
		});

		it('rejette avec le message d\'erreur', async (t) => {
			const client = createClient();
			t.mock.method(client, 'uploadFrom', async () => {
				throw new Error('Connexion perdue');
			});

			await assert.rejects(createWrapper(client).ftpPut('theme/a.css'), (error) => error === 'Connexion perdue');
		});

	});

	describe('ftpRemove / ftpRmdir', () => {

		const cases = [
			{ method: 'ftpRemove', clientMethod: 'remove' },
			{ method: 'ftpRmdir', clientMethod: 'removeDir' },
		];

		for (const { method, clientMethod } of cases) {

			it(`${method} supprime le chemin distant`, async (t) => {
				const client = createClient();
				const mocked = t.mock.method(client, clientMethod);

				await createWrapper(client)[method]('theme/old');

				assert.deepEqual(mocked.mock.calls[0].arguments, ['/theme/old']);
			});

			it(`${method} ignore une erreur 550 (déjà supprimé)`, async (t) => {
				const client = createClient();
				t.mock.method(client, clientMethod, async () => {
					throw new FTP.FTPError({ code: 550, message: 'No such file' });
				});

				await createWrapper(client)[method]('theme/old');
			});

			it(`${method} rejette les autres erreurs`, async (t) => {
				const client = createClient();
				t.mock.method(client, clientMethod, async () => {
					throw new FTP.FTPError({ code: 530, message: 'Not logged in' });
				});

				await assert.rejects(createWrapper(client)[method]('theme/old'), (error) => error === 'Not logged in');
			});

		}

	});

});
