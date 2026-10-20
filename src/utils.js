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
 * Test names kiubi-sync must ignore (hidden or editor lock files and directories),
 * whatever the local or remote side contains
 *
 * @param {String} filename
 * @returns {Boolean}
 */
function isForbiddenFilename(filename) {
	return (filename.match(/^\./) !== null || filename.match(/\.LCK$/) !== null);
}

/**
 * Test if a path is, or is inside, an ignored file or directory
 *
 * @param {String} path
 * @returns {Boolean}
 */
function isForbiddenPath(path) {
	return path.split(/[\\/]/)
		.filter((name) => name !== '' && name !== '.' && name !== '..')
		.some(isForbiddenFilename);
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

module.exports = { toFtpPath, isForbiddenFilename, isForbiddenPath, ensureLocalDirectory };
