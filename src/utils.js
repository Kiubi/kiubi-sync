const { sep, posix, relative, resolve, isAbsolute } = require('path');
const { mkdir, stat } = require('fs');
const { promisify } = require('util');
const fsMkDir = promisify(mkdir);
const fsStat = promisify(stat);

/**
 * Path relative to a root directory, with POSIX separators
 *
 * @param {String} root
 * @param {String} path
 * @returns {String|null} '' for the root itself, null if the path is outside the root
 */
function toRelativePath(root, path) {
	const relativePath = relative(resolve(root), resolve(path));
	if (relativePath === '..' || relativePath.startsWith('..' + sep) || isAbsolute(relativePath)) {
		return null;
	}
	return relativePath.split(sep).join(posix.sep);
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

module.exports = { toRelativePath, isForbiddenFilename, isForbiddenPath, ensureLocalDirectory };
