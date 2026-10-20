const FtpSrv = require('ftp-srv');

const USER = 'kiubi-test';
const PASSWORD = 'secret';

// Silent logger with the subset of the bunyan API used by ftp-srv
const quietLog = {
	child: () => quietLog,
	trace() {},
	debug() {},
	info() {},
	warn() {},
	error() {},
	fatal() {},
};

/**
 * Start a local FTP server serving the given directory
 *
 * @param {String} root Directory used as the remote root
 * @returns {Promise<Object>} { host, port, user, password, close() }
 */
async function startFtpServer(root) {
	const server = new FtpSrv({
		url: 'ftp://127.0.0.1:0',
		pasv_url: '127.0.0.1',
		greeting: 'FTP de test',
		// Comme le serveur Kiubi (<Limit CDUP XCUP> DenyAll)
		blacklist: ['CDUP', 'XCUP'],
		log: quietLog,
	});

	server.on('login', ({ username, password }, resolve, reject) => {
		if (username === USER && password === PASSWORD) {
			resolve({ root: root });
		}
		else {
			reject(new Error('Identifiants invalides'));
		}
	});

	await server.listen();

	return {
		host: '127.0.0.1',
		port: server.server.address().port,
		user: USER,
		password: PASSWORD,
		close: () => server.close(),
	};
}

module.exports = { startFtpServer };
