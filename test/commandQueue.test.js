const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const CommandQueue = require('../src/commandQueue');

// lodash.debounce garde une référence aux timers natifs : on utilise un délai court
// plutôt que les faux timers de node:test
const DELAY = 5;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exécuteur factice qui enregistre les commandes reçues
 *
 * @param {Number} duration Durée simulée de chaque commande
 */
function createExecutor(duration = 0) {
	const executor = (command) => {
		executor.running++;
		executor.maxRunning = Math.max(executor.maxRunning, executor.running);
		executor.calls.push(command);
		return sleep(duration).then(() => {
			executor.running--;
		});
	};
	executor.calls = [];
	executor.running = 0;
	executor.maxRunning = 0;
	return executor;
}

describe('CommandQueue', () => {

	beforeEach((t) => {
		t.mock.method(console, 'log', () => {});
	});

	it('n\'exécute rien avant la fin du délai', async () => {
		const executor = createExecutor();
		const queue = new CommandQueue(executor, DELAY);

		queue.add('ftpPut', 'theme/a.css');
		assert.equal(executor.calls.length, 0);

		await sleep(DELAY * 6);
		assert.deepEqual(executor.calls, [{ cmd: 'ftpPut', path: 'theme/a.css' }]);
	});

	it('regroupe les commandes rapprochées et les exécute dans l\'ordre', async () => {
		const executor = createExecutor();
		const queue = new CommandQueue(executor, DELAY);

		queue.add('ftpPut', 'theme/a.css');
		queue.add('ftpRemove', 'theme/b.js');
		queue.add('ftpRmdir', 'theme/old');

		await sleep(DELAY * 6);
		assert.deepEqual(executor.calls, [
			{ cmd: 'ftpPut', path: 'theme/a.css' },
			{ cmd: 'ftpRemove', path: 'theme/b.js' },
			{ cmd: 'ftpRmdir', path: 'theme/old' },
		]);
	});

	it('ignore une commande identique déjà en attente', async () => {
		const executor = createExecutor();
		const queue = new CommandQueue(executor, DELAY);

		queue.add('ftpPut', 'theme/a.css');
		queue.add('ftpPut', 'theme/a.css');
		queue.add('ftpRemove', 'theme/a.css');

		await sleep(DELAY * 6);
		assert.deepEqual(executor.calls, [
			{ cmd: 'ftpPut', path: 'theme/a.css' },
			{ cmd: 'ftpRemove', path: 'theme/a.css' },
		]);
	});

	it('accepte les doublons quand unique vaut false', async () => {
		const executor = createExecutor();
		const queue = new CommandQueue(executor, DELAY);

		queue.add('ftpRmdir', 'theme/old', false);
		queue.add('ftpRmdir', 'theme/old', false);

		await sleep(DELAY * 6);
		assert.equal(executor.calls.length, 2);
	});

	it('n\'exécute jamais deux commandes en parallèle', async () => {
		const executor = createExecutor(DELAY * 4);
		const queue = new CommandQueue(executor, DELAY);

		queue.add('ftpPut', 'theme/a.css');
		queue.add('ftpPut', 'theme/b.css');
		await sleep(DELAY * 3);

		// Ajout pendant que le premier flush est en cours
		queue.add('ftpPut', 'theme/c.css');

		await sleep(DELAY * 30);
		assert.deepEqual(executor.calls.map((command) => command.path), ['theme/a.css', 'theme/b.css', 'theme/c.css']);
		assert.equal(executor.maxRunning, 1);
	});

	it('libère le verrou après une erreur d\'exécution', async () => {
		let fail = true;
		const calls = [];
		const queue = new CommandQueue((command) => {
			calls.push(command.path);
			if (fail) {
				fail = false;
				return Promise.reject('Erreur simulée');
			}
			return Promise.resolve();
		}, DELAY);

		queue.add('ftpPut', 'theme/a.css');
		await sleep(DELAY * 6);
		assert.equal(queue.lock, false);

		queue.add('ftpPut', 'theme/b.css');
		await sleep(DELAY * 6);
		assert.deepEqual(calls, ['theme/a.css', 'theme/b.css']);
	});

});
