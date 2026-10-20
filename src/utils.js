const { sep, posix } = require('path');
const { mkdir, stat } = require('fs');
const { promisify } = require('util');
const fsMkDir = promisify(mkdir);
const fsStat = promisify(stat);

/**
 * Convert local path into ftp file systeme (POSIX)
 *
 * @param {String} path
 * @returns {String}
 */
function toFtpPath(path) {
	return '/' + path.split(sep).join(posix.sep);
}

/**
 * Test filenames that ftp server will not allowed
 *
 * @param {String} filename
 * @returns {Boolean}
 */
function isForbiddenFilename(filename) {
	return (filename.match(/^\./) !== null || filename.match(/\.LCK$/) !== null);
}

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

module.exports = { toFtpPath, isForbiddenFilename, ensureLocalDirectory };
