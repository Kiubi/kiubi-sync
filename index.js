const FTP = require('basic-ftp');
const { filter, endsWith } = require('lodash');
const byteSize = require('byte-size');

const { join, posix } = require('path');
const { readdir, stat, utimes } = require('fs');
const { promisify } = require('util');
const fsReadDir = promisify(readdir);
const fsStat = promisify(stat);
const fsUtimes = promisify(utimes);

const chalk = require('chalk');

const { toRelativePath, isForbiddenFilename, isForbiddenPath, ensureLocalDirectory } = require('./src/utils');

// Remote directory of the theme on the Kiubi FTP server
const REMOTE_DIR = '/theme';
const CommandQueue = require('./src/commandQueue');

byteSize.defaultOptions({
	units: 'iec',
	precision: 2,
	toStringFn: function() {
		return this.value + this.unit;
	},
});

/**
 * Handle transfert summary
 */
class Timer {

	/**
	 * Constructor
	 */
	constructor() {
		this.startTime = null;
		this.duration = null;
		this.ftpClient = null;
		this.bytesOverall = null;
	}

	/**
	 * Start timer
	 *
	 * @param {ftpWrapper} ftpClient
	 */
	start(ftpClient) {
		this.startTime = new Date();
		this.duration = 0;
		this.bytesOverall = 0;
		this.ftpClient = ftpClient;
		this.ftpClient.trackProgress(this.onProgress.bind(this));
	}

	/**
	 * Stop timer
	 */
	stop() {
		this.duration = new Date().getTime() - this.startTime;

		this.ftpClient.trackProgress();
		this.ftpClient = null;

		const time = chalk.magenta(Math.ceil(this.duration / 1000) + ' sec');
		const size = chalk.cyan(byteSize(this.bytesOverall));

		console.log(`Transert de ${size} en ${time}`);
	}

	/**
	 * onProgress callback
	 *
	 * @param {Object} info
	 */
	onProgress(info) {
		this.bytesOverall = info.bytesOverall;
	}

}

/**
 *
 */
class ftpWrapper {

	/**
	 * Constructor
	 *
	 * @param {Object} params {
	 *     					port: Number, // Port number, default 21
	 *     					host: String, // Hostname, default "ftp.kiubi-web.com"
	 *     					user: String, // Username
	 *     					password: String, // Password
	 *     					localDir: String, // Local directory of the theme, default "theme"
	 *     					client: FTP.Client, // FTP client, default new FTP.Client()
	 * 					}
	 */
	constructor(params) {
		this.port = params.port || 21;
		this.host = params.host || 'ftp.kiubi-web.com';
		this.user = params.user;
		this.password = params.password;
		this.localDir = params.localDir || 'theme';
		this.ftpClient = params.client || new FTP.Client();

		this.queue = new CommandQueue((command) => this.runCommand(command));
	}

	/**
	 * Close current FTP connection
	 */
	close() {
		if (!this.ftpClient.closed) {
			this.ftpClient.close();
		}
	}

	/**
	 * Open connection if needed
	 *
	 * @returns {Promise<void>}
	 */
	async connect() {
		if (!this.ftpClient.closed) {
			return;
		}

		try {
			await this.ftpClient.access({
				host: this.host,
				user: this.user,
				port: this.port,
				password: this.password,
				secure: false,
			});
		}
		catch(err) {
			console.log(chalk.red('Erreur'), err);
		}
	}

	/**
	 * Watch file modification and publish them
	 *
	 * @param {chokidar} watcher
	 */
	watch(watcher) {

		watcher.on('change', (path) => this.pushFile(path));

		watcher.on('add', (path) => this.pushFile(path));

		watcher.on('unlink', (path) => this.deleteFile(path));

		watcher.on('unlinkDir', (path) => this.deleteDir(path));
	}

	/**
	 * Pull all files from the remote ftp server
	 *
	 * @param {String} [path] Local directory, default the whole local directory of the theme
	 * @param {Object} [options] :
	 * 					- {String}[] skipFiles : Ignore Extensions
	 * 					- {Number} skipSize : MaxSize
	 * @returns {Promise<undefined>}
	 */
	pullAll(path, options) {
		if (typeof path === 'object' && path !== null) {
			options = path;
			path = null;
		}
		return this.downloadToDir(path || this.localDir, options).catch((error)=>{
			console.log(chalk.red('Erreur'), error);
		}).finally(()=>this.close());
	}

	/**
	 * Push all files to the remote ftp server
	 *
	 * @param {String} [path] Local directory, default the whole local directory of the theme
	 * @returns {Promise<undefined>}
	 */
	pushAll(path) {
		return this.deploy(path || this.localDir).catch((error)=>{
			console.log(chalk.red('Erreur'), error);
		}).finally(()=>this.close());
	}

	/**
	 * Run a queued ftp command
	 *
	 * @param {Object} command { cmd, path }
	 * @returns {Promise<void>}
	 */
	runCommand(command) {
		switch(command.cmd) {
		case 'ftpPut':
			return this.ftpPut(command.path);
		case 'ftpRemove':
			return this.ftpRemove(command.path);
		case 'ftpRmdir':
			return this.ftpRmdir(command.path);
		default:
			return Promise.reject('Commande inconnue');
		}
	}

	/**
	 * Add a push ftp command into the stack
	 *
	 * @param {String} path
	 */
	pushFile(path) {
		if (!this._isSyncable(path)) {
			return;
		}
		this.queue.add('ftpPut', path);
	}

	/**
	 * Add a delete ftp command into the stack
	 *
	 * @param {String} path
	 */
	deleteFile(path) {
		if (!this._isSyncable(path)) {
			return;
		}
		this.queue.add('ftpRemove', path);
	}

	/**
	 * Add a delete ftp command into the stack
	 *
	 * @param {String} path
	 */
	deleteDir(path) {
		// Never remove the whole remote theme, even if the local directory disappears
		if (!this._isSyncable(path) || toRelativePath(this.localDir, path) === '') {
			return;
		}
		this.queue.add('ftpRmdir', path, false);
	}

	/**
	 * Test if a local path must be synchronised
	 *
	 * @param {String} path
	 * @returns {Boolean}
	 * @private
	 */
	_isSyncable(path) {
		const relativePath = toRelativePath(this.localDir, path);
		if (relativePath === null) {
			console.log(chalk.yellow('Ignoré'), `${path} (hors de ${this.localDir})`);
			return false;
		}
		return !isForbiddenPath(relativePath);
	}

	/**
	 * Remote path of a local path
	 *
	 * @param {String} path Local path, inside the local directory of the theme
	 * @returns {String} Absolute remote path
	 * @private
	 */
	_toRemotePath(path) {
		const relativePath = toRelativePath(this.localDir, path);
		if (relativePath === null) {
			throw new Error(`${path} n'est pas dans le dossier du thème (${this.localDir})`);
		}
		return posix.join(REMOTE_DIR, relativePath);
	}

	/** Low level FTP Command **/

	/**
	 * Actual PUT command
	 *
	 * @param {String} path
	 * @returns {Promise<never>}
	 */
	async ftpPut(path) {

		const prefix = chalk.green('>');

		console.log(`${prefix} ${path}`);

		try {
			const remotePath = this._toRemotePath(path);
			await this.connect();
			const timer = new Timer();
			timer.start(this.ftpClient);

			await this.ftpClient.ensureDir(posix.dirname(remotePath));
			await this.ftpClient.uploadFrom(path, remotePath);
			timer.stop();
		}
		catch(error) {
			return Promise.reject(error.message);
		}

	}

	/**
	 * Actual DELETE command
	 *
	 * @param {String} path
	 * @returns {Promise<void>}
	 */
	async ftpRemove(path) {

		const prefix = chalk.red('X');

		console.log(`${prefix} ${path}`);

		try {
			await this.connect();
			await this.ftpClient.remove(this._toRemotePath(path));
		}
		catch(error) {

			if (error instanceof FTP.FTPError && error.code == 550) {
				// file already deleted
				return Promise.resolve();
			}

			return Promise.reject(error.message);
		}
	}

	/**
	 * Actual RMDIR command
	 *
	 * @param {String} path
	 * @returns {Promise<void>}
	 */
	async ftpRmdir(path) {

		const prefix = chalk.red('X');

		console.log(`${prefix} ${path}/`);

		try {
			await this.connect();
			await this._removeDir(this._toRemotePath(path));
		}
		catch(error) {
			return Promise.reject(error.message);
		}

	}

	/**
	 * Remove a remote directory and its content
	 *
	 * Only absolute paths are used: basic-ftp removeDir() relies on CDUP,
	 * which is denied by the Kiubi FTP server
	 *
	 * @param {String} ftpPath Absolute remote path
	 * @returns {Promise<void>} Resolved if the directory does not exist
	 * @private
	 */
	async _removeDir(ftpPath) {
		let files;
		try {
			files = await this.ftpClient.list(ftpPath);
		}
		catch(error) {
			// Servers answer 450, 451 or 550 for a missing directory, but these codes
			// may also mean something else: check the parent before ignoring the error
			if (error instanceof FTP.FTPError && [450, 451, 550].includes(error.code) && !(await this._remoteExists(ftpPath))) {
				// dir already deleted
				return;
			}
			throw error;
		}

		for (const file of files) {
			if (file.name === '.' || file.name === '..') {
				continue;
			}
			const filePath = posix.join(ftpPath, file.name);
			if (file.isDirectory) {
				await this._removeDir(filePath);
			}
			else {
				await this.ftpClient.remove(filePath);
			}
		}
		await this.ftpClient.removeEmptyDir(ftpPath);
	}

	/**
	 * Test if a remote path exists, by listing its parent directory
	 *
	 * @param {String} ftpPath Absolute remote path
	 * @returns {Promise<Boolean>} false if the parent directory can not be listed
	 * @private
	 */
	async _remoteExists(ftpPath) {
		try {
			const files = await this.ftpClient.list(posix.dirname(ftpPath));
			return files.some((file) => file.name === posix.basename(ftpPath));
		}
		catch(error) {
			if (error instanceof FTP.FTPError) {
				return false;
			}
			throw error;
		}
	}

	/**
	 * Pull a directory from the remote FTP server
	 *
	 * @param {String} path
	 * @param {Object} options
	 * @returns {Promise<never>}
	 */
	async downloadToDir(path, options) {

		options = options || {};
		const _parseList = this.ftpClient.parseList;

		try {
			this._toRemotePath(path);
			await this.connect();
			const timer = new Timer();

			this.ftpClient.parseList = function(rawList) {
				const fileList = filter(_parseList(rawList), function(file) {
					if (options.skipSize && options.skipSize > 0 && file.size >= options.skipSize) {
						console.log(chalk.magenta('S'), file.name);
						return false;
					}
					if (options.skipFiles && options.skipFiles.length && file.type === 1) {
						for(let i = 0; i < options.skipFiles.length; i++) {
							if (endsWith(file.name.toLowerCase(), '.' + options.skipFiles[i])) {
								console.log(chalk.magenta('S'), file.name);
								return false;
							}
						}
					}
					return true;
				});
				return fileList;
			};

			timer.start(this.ftpClient);
			await this._downloadReq(path);
			timer.stop();
		}
		catch(error) {
			return Promise.reject(error.message);
		}
		finally {
			this.ftpClient.parseList = _parseList;
		}

	}

	/**
	 * Push a directory into the remote FTP server
	 *
	 * @param {String} path
	 * @returns {Promise<never>}
	 */
	async deploy(path) {

		try {
			const remotePath = this._toRemotePath(path);
			await this.connect();
			const timer = new Timer();
			timer.start(this.ftpClient);
			await this.ftpClient.ensureDir(remotePath);
			await this._uploadToWorkingDir(path);
			timer.stop();
		}
		catch(error) {
			return Promise.reject(error.message);
		}

	}

	/**
	 * Push files recursively into the remote FTP server
	 *
	 * @param {String} localDirPath
	 * @returns {Promise<void>}
	 * @private
	 */
	async _uploadToWorkingDir(localDirPath) {
		const files = await fsReadDir(localDirPath);
		for (const file of files) {
			if (isForbiddenFilename(file)) {
				continue;
			}
			const fullPath = join(localDirPath, file);
			const stats = await fsStat(fullPath);
			if (stats.isFile()) {
				console.log(chalk.green('>'), fullPath);
				await this.ftpClient.uploadFrom(fullPath, this._toRemotePath(fullPath));
			}
			else if (stats.isDirectory()) {
				await this.ftpClient.ensureDir(this._toRemotePath(fullPath));
				await this._uploadToWorkingDir(fullPath);
			}
		}
	}

	/**
	 * Pull files recursively from the remote FTP server
	 *
	 * @param {String} localDirPath
	 * @returns {Promise<void>}
	 * @private
	 */
	async _downloadReq(localDirPath) {
		await ensureLocalDirectory(localDirPath);

		const remoteDirPath = this._toRemotePath(localDirPath);
		await this.ftpClient.cd(remoteDirPath);
		for (const file of await this.ftpClient.list()) {
			if (isForbiddenFilename(file.name)) {
				continue;
			}
			const localPath = join(localDirPath, file.name);
			if (file.isDirectory) {
				await this.ftpClient.cd(file.name);
				await this._downloadReq(localPath);
				await this.ftpClient.cd(remoteDirPath);
			}
			else if (file.isFile) {
				// Skip donwload if local and remote file have same size and
				// same modification within +/- 1sec
				try {
					const stats = await fsStat(localPath);

					if (stats.size === file.size) {
						const remoteDate = await this._remoteModifiedAt(file);
						if (remoteDate && Math.abs(remoteDate.getTime() - stats.mtime.getTime()) < 1000) {
							console.log(chalk.magenta('S'), localPath);
							// skip file
							continue;
						}
					}
				}
				catch(error) {
					// File not found. So download...
				}

				console.log(chalk.green('<'), localPath);
				await this.ftpClient.downloadTo(localPath, file.name);

				// Align local modification date on the remote one, so the
				// next pull can skip this file
				const remoteDate = await this._remoteModifiedAt(file);
				if (remoteDate) {
					await fsUtimes(localPath, new Date(), remoteDate);
				}
			}
		}
	}

	/**
	 * Modification date of a remote file of the current directory
	 *
	 * Given by the listing when the server supports MLSD, otherwise asked with MDTM
	 *
	 * @param {FileInfo} file
	 * @returns {Promise<Date|null>} null if the server can not tell
	 * @private
	 */
	async _remoteModifiedAt(file) {
		if (file.modifiedAt) {
			return file.modifiedAt;
		}
		try {
			return await this.ftpClient.lastMod(file.name);
		}
		catch(error) {
			return null;
		}
	}

}

module.exports = ftpWrapper;
