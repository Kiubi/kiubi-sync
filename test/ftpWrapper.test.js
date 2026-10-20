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
		access: async () => {},
		lastMod: async () => new Date(),
		ensureDir: async () => {},
		uploadFrom: async () => {},
		list: async () => [],
		remove: async () => {},
		removeEmptyDir: async () => {},
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

		it('ignore tout ce qui se trouve dans un dossier interdit', (t) => {
			const ftp = createWrapper();
			const add = t.mock.method(ftp.queue, 'add', () => {});
			const watcher = new EventEmitter();

			ftp.watch(watcher);
			watcher.emit('add', 'theme/.git/config');
			watcher.emit('change', 'theme/fr/.vscode/settings.json');
			watcher.emit('unlink', 'theme/.git/index');
			watcher.emit('unlinkDir', 'theme/.git/refs');
			watcher.emit('unlinkDir', 'theme/.cache');

			assert.equal(add.mock.callCount(), 0);
		});

	});

	describe('watch → file → FTP', () => {

		it('envoie le fichier modifié une fois la temporisation écoulée', async (t) => {
			const ftp = createWrapper();
			const put = t.mock.method(ftp, 'ftpPut', async () => {});
			const watcher = new EventEmitter();

			ftp.watch(watcher);
			watcher.emit('change', 'theme/a.css');
			assert.equal(put.mock.callCount(), 0);

			// Déclenche immédiatement la temporisation de lodash.debounce
			ftp.queue.deflush.flush();
			await new Promise((resolve) => setImmediate(resolve));

			assert.deepEqual(put.mock.calls.map((call) => call.arguments), [['theme/a.css']]);
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

	describe('connect', () => {

		it('affiche l\'erreur de connexion sans la rejeter', async (t) => {
			const client = createClient();
			client.closed = true;
			t.mock.method(client, 'access', async () => {
				throw new Error('Connexion refusée');
			});

			await createWrapper(client).connect();

			const errors = console.log.mock.calls.filter((call) => String(call.arguments[0]).includes('Erreur'));
			assert.equal(errors.length, 1);
		});

		it('ne se reconnecte pas si la connexion est ouverte', async (t) => {
			const client = createClient();
			const access = t.mock.method(client, 'access', async () => {});

			await createWrapper(client).connect();

			assert.equal(access.mock.callCount(), 0);
		});

	});

	describe('_remoteModifiedAt', () => {

		it('utilise la date du listing quand le serveur la fournit (MLSD)', async (t) => {
			const client = createClient();
			const lastMod = t.mock.method(client, 'lastMod', async () => new Date());
			const modifiedAt = new Date('2026-01-15T10:00:00Z');

			const date = await createWrapper(client)._remoteModifiedAt({ name: 'style.css', modifiedAt: modifiedAt });

			assert.equal(date, modifiedAt);
			assert.equal(lastMod.mock.callCount(), 0);
		});

		it('demande la date au serveur sinon (MDTM)', async (t) => {
			const client = createClient();
			const modifiedAt = new Date('2026-01-15T10:00:00Z');
			const lastMod = t.mock.method(client, 'lastMod', async () => modifiedAt);

			const date = await createWrapper(client)._remoteModifiedAt({ name: 'style.css' });

			assert.equal(date, modifiedAt);
			assert.deepEqual(lastMod.mock.calls[0].arguments, ['style.css']);
		});

		it('renvoie null si le serveur ne connaît pas la date', async (t) => {
			const client = createClient();
			t.mock.method(client, 'lastMod', async () => {
				throw new FTP.FTPError({ code: 502, message: 'Command not implemented' });
			});

			assert.equal(await createWrapper(client)._remoteModifiedAt({ name: 'style.css' }), null);
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

	describe('ftpRemove', () => {

		it('supprime le chemin distant', async (t) => {
			const client = createClient();
			const remove = t.mock.method(client, 'remove');

			await createWrapper(client).ftpRemove('theme/old.css');

			assert.deepEqual(remove.mock.calls[0].arguments, ['/theme/old.css']);
		});

		it('ignore une erreur 550 (déjà supprimé)', async (t) => {
			const client = createClient();
			t.mock.method(client, 'remove', async () => {
				throw new FTP.FTPError({ code: 550, message: 'No such file' });
			});

			await createWrapper(client).ftpRemove('theme/old.css');
		});

		it('rejette les autres erreurs', async (t) => {
			const client = createClient();
			t.mock.method(client, 'remove', async () => {
				throw new FTP.FTPError({ code: 530, message: 'Not logged in' });
			});

			await assert.rejects(createWrapper(client).ftpRemove('theme/old.css'), (error) => error === 'Not logged in');
		});

	});

	describe('ftpRmdir', () => {

		/**
		 * Client factice exposant une arborescence distante { '/chemin': [FileInfo] }
		 */
		function createTreeClient(tree) {
			const client = createClient();
			client.operations = [];
			client.list = async (path) => {
				if (!(path in tree)) {
					throw new FTP.FTPError({ code: 450, message: `${path}: No such file or directory` });
				}
				return tree[path];
			};
			client.remove = async (path) => {
				client.operations.push(['DELE', path]);
			};
			client.removeEmptyDir = async (path) => {
				client.operations.push(['RMD', path]);
			};
			client.cd = async () => {
				throw new Error('cd ne doit pas être utilisé');
			};
			client.cdup = async () => {
				throw new Error('cdup ne doit pas être utilisé');
			};
			return client;
		}

		const dir = (name) => ({ name: name, isDirectory: true });
		const file = (name) => ({ name: name, isDirectory: false });

		it('supprime récursivement avec des chemins absolus, sans changer de dossier', async () => {
			const client = createTreeClient({
				'/theme/fr/old': [file('a.css'), dir('sub'), file('.DS_Store')],
				'/theme/fr/old/sub': [file('b.html'), file('c.html.LCK')],
			});

			await createWrapper(client).ftpRmdir('theme/fr/old');

			assert.deepEqual(client.operations, [
				['DELE', '/theme/fr/old/a.css'],
				['DELE', '/theme/fr/old/sub/b.html'],
				['DELE', '/theme/fr/old/sub/c.html.LCK'],
				['RMD', '/theme/fr/old/sub'],
				['DELE', '/theme/fr/old/.DS_Store'],
				['RMD', '/theme/fr/old'],
			]);
		});

		it('ne descend jamais dans . ou ..', async () => {
			const client = createTreeClient({
				'/theme/fr/old': [dir('.'), dir('..'), file('a.css')],
			});

			await createWrapper(client).ftpRmdir('theme/fr/old');

			assert.deepEqual(client.operations, [
				['DELE', '/theme/fr/old/a.css'],
				['RMD', '/theme/fr/old'],
			]);
		});

		for (const code of [450, 451, 550]) {
			it(`considère un ${code} comme déjà supprimé si le dossier a disparu du parent`, async () => {
				const client = createTreeClient({
					'/theme': [file('style.css')],
				});
				client.list = async (path) => {
					if (path === '/theme') {
						return [file('style.css')];
					}
					throw new FTP.FTPError({ code: code, message: 'No such file or directory' });
				};

				await createWrapper(client).ftpRmdir('theme/old');
				assert.deepEqual(client.operations, []);
			});
		}

		it('considère le dossier comme supprimé si son parent a aussi disparu', async () => {
			const client = createTreeClient({});

			await createWrapper(client).ftpRmdir('theme/old/sub');
			assert.deepEqual(client.operations, []);
		});

		it('rejette l\'erreur si le dossier existe toujours dans le parent', async () => {
			const client = createTreeClient({});
			client.list = async (path) => {
				if (path === '/theme') {
					return [dir('old')];
				}
				throw new FTP.FTPError({ code: 451, message: 'Local error' });
			};

			await assert.rejects(createWrapper(client).ftpRmdir('theme/old'), (error) => error === 'Local error');
		});

		it('propage une erreur non FTP pendant la vérification du parent', async () => {
			const client = createTreeClient({});
			client.list = async (path) => {
				if (path === '/theme') {
					throw new Error('Socket fermée');
				}
				throw new FTP.FTPError({ code: 550, message: 'No such file or directory' });
			};

			await assert.rejects(createWrapper(client).ftpRmdir('theme/old'), (error) => error === 'Socket fermée');
		});

		it('rejette une erreur survenue pendant la suppression du contenu', async () => {
			const client = createTreeClient({
				'/theme/old': [file('a.css')],
			});
			client.remove = async () => {
				throw new FTP.FTPError({ code: 550, message: 'Permission denied' });
			};

			await assert.rejects(createWrapper(client).ftpRmdir('theme/old'), (error) => error === 'Permission denied');
		});

		it('rejette les autres erreurs de listing', async (t) => {
			const client = createClient();
			t.mock.method(client, 'list', async () => {
				throw new FTP.FTPError({ code: 530, message: 'Not logged in' });
			});

			await assert.rejects(createWrapper(client).ftpRmdir('theme/old'), (error) => error === 'Not logged in');
		});

	});

});
