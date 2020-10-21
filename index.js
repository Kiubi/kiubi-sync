const FTP = require('basic-ftp');
const { debounce } = require('lodash');
const byteSize = require('byte-size');

const { join, basename, dirname } = require('path');
const { mkdir, readdir, stat } = require('fs');
const { promisify } = require('util');
const fsReadDir = promisify(readdir);
const fsMkDir = promisify(mkdir);
const fsStat = promisify(stat);

const chalk = require('chalk');

byteSize.defaultOptions({
	units: 'iec',
	precision: 2,
	toStringFn: function() {
		return this.value + this.unit;
	},
});

/**
 * Ensure local directory exists
 *
 * @param {String} path
 * @returns {Promise<void>}
 */
async function ensureLocalDirectory(path) {
	try {
		await fsStat(path);
	}
	catch(err) {
		await fsMkDir(path, { recursive: true });
	}
}

/**
 * Test filenames that ftp server will not allowed
 */
function isForbiddenFilename(filename) {
	return (filename.match(/^\./) !== null || filename.match(/\.LCK$/) !== null);
}

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
	 * 					}
	 */
	constructor(params) {
		this.port = params.port || 21;
		this.host = params.host || 'ftp.kiubi-web.com';
		this.user = params.user;
		this.password = params.password;
		this.ftpClient = new FTP.Client();

		this.deflush = debounce(this.flush, 300);
		this.lock = false;
		this.stack = [];
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
	 * @param {String} path
	 * @returns {Promise<undefined>}
	 */
	pullAll(path) {
		return this.downloadToDir(path).catch((error)=>{
			console.log(chalk.red('Erreur'), error);
		}).finally(()=>this.close());
	}

	/**
	 * Push all files to the remote ftp server
	 *
	 * @param {String} path
	 * @returns {Promise<undefined>}
	 */
	pushAll(path) {
		return this.deploy(path).catch((error)=>{
			console.log(chalk.red('Erreur'), error);
		}).finally(()=>this.close());
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
			return p.then(() => {

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
			});
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

	/**
	 * Add a push ftp command into the stack
	 *
	 * @param {String} path
	 */
	pushFile(path) {

		const filename = basename(path);
		if (isForbiddenFilename(filename)) {
			return;
		}

		const index = this.stack.findIndex((cmd) => cmd.cmd == 'ftpPut' && cmd.path == path);
		if (index >= 0) {
			return;
		}

		this.stack.push({
			'cmd':'ftpPut',
			'path':path,
		});
		this.deflush();
	}

	/**
	 * Add a delete ftp command into the stack
	 *
	 * @param {String} path
	 */
	deleteFile(path) {

		const filename = basename(path);
		if (isForbiddenFilename(filename)) {
			return;
		}

		const index = this.stack.findIndex((cmd) => cmd.cmd == 'ftpRemove' && cmd.path == path);
		if (index >= 0) {
			return;
		}

		this.stack.push({
			'cmd':'ftpRemove',
			'path':path,
		});
		this.deflush();
	}

	/**
	 * Add a delete ftp command into the stack
	 *
	 * @param {String} path
	 */
	deleteDir(path) {
		this.stack.push({
			'cmd':'ftpRmdir',
			'path':path,
		});
		this.deflush();
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
			await this.connect();
			const timer = new Timer();
			timer.start(this.ftpClient);

			const baseDir = dirname(path);
			await this.ftpClient.ensureDir(`/${baseDir}`);
			await this.ftpClient.uploadFrom(path, `/${path}`);
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
			await this.ftpClient.remove(`/${path}`);
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
			await this.ftpClient.removeDir(`/${path}`);
		}
		catch(error) {

			if (error instanceof FTP.FTPError && error.code == 550) {
				// dir already deleted
				return Promise.resolve();
			}

			return Promise.reject(error.message);
		}

	}

	/**
	 * Pull a directory from the remote FTP server
	 *
	 * @param {String} path
	 * @returns {Promise<never>}
	 */
	async downloadToDir(path) {

		try {
			await this.connect();
			const timer = new Timer();
			timer.start(this.ftpClient);
			await this._downloadReq(path);
			timer.stop();
		}
		catch(error) {
			return Promise.reject(error.message);
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
			await this.connect();
			const timer = new Timer();
			timer.start(this.ftpClient);
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
			const fullPath = join(localDirPath, file);
			const stats = await fsStat(fullPath);
			if (stats.isFile() && !isForbiddenFilename(file)) {
				console.log(chalk.green('>'), fullPath);
				await this.ftpClient.uploadFrom(fullPath, '/' + fullPath);
			}
			else if (stats.isDirectory()) {
				await this.ftpClient.ensureDir(`/${fullPath}`);
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

		await this.ftpClient.cd(`/${localDirPath}`);
		for (const file of await this.ftpClient.list()) {
			const localPath = join(localDirPath, file.name);
			if (file.isDirectory) {
				await this.ftpClient.cd(file.name);
				await this._downloadReq(localPath);
				await this.ftpClient.cd('/' + localDirPath);
			}
			else if (file.isFile && !isForbiddenFilename(file.name)) {
				// Skip donwload if local and remote file have same size and
				// same modification within +/- 1sec
				try {
					const stats = await fsStat(localPath);

					if (stats.size === file.size && Math.abs(file.modifiedAt.getTime() - stats.atime.getTime()) < 1000) {
						console.log(chalk.magenta('S'), localPath);
						// skip file
						continue;
					}
				}
				catch(error) {
					// File not found. So download...
				}

				console.log(chalk.green('<'), localPath);
				await this.ftpClient.downloadTo(localPath, file.name);
			}
		}
	}

}

module.exports = ftpWrapper;
