const { debounce } = require('lodash');
const chalk = require('chalk');

/**
 * Debounced queue of ftp commands, run sequentially
 */
class CommandQueue {

	/**
	 * Constructor
	 *
	 * @param {Function} executor Called with each command ({ cmd, path }), must return a Promise
	 * @param {Number} delay Debounce delay in ms, default 300
	 */
	constructor(executor, delay = 300) {
		this.executor = executor;
		this.deflush = debounce(this.flush, delay);
		this.lock = false;
		this.stack = [];
	}

	/**
	 * Add a command into the stack
	 *
	 * @param {String} cmd
	 * @param {String} path
	 * @param {Boolean} unique Ignore command if the same one is already queued
	 */
	add(cmd, path, unique = true) {
		if (unique && this.stack.some((command) => command.cmd == cmd && command.path == path)) {
			return;
		}

		this.stack.push({
			'cmd': cmd,
			'path': path,
		});
		this.deflush();
	}

	/**
	 * Flush current ftp command stack
	 */
	flush() {

		if (this.stack.length === 0) return;

		if (this.lock) {
			this.deflush();
			return;
		}
		this.lock = true;

		console.log('Publication des modifications...');

		this.stack.reduce((p, command) => {
			return p.then(() => this.executor(command));
		}, Promise.resolve())
			.catch((e) => {
				console.log(chalk.red('Erreur de transfert !'));
				console.log(e);
			})
			.finally(() => {
				this.lock = false;
				this.deflush();
			});
		this.stack = [];

	}

}

module.exports = CommandQueue;
