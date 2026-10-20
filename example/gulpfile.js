const { watch, src, pipe, dest, parallel, series } = require('gulp');
const minify = require('gulp-minify');
const concat = require('gulp-concat');
const cleanCSS = require('gulp-clean-css');
const kSync = require('kiubi-sync');
const fs = require('fs');

const config = require('./config.json');

// Dossier local du thème, publié dans le dossier "theme" du FTP Kiubi
const THEME_DIR = 'theme';

const sync = new kSync({
	user: config.user,
	password: config.password,
	localDir: THEME_DIR
});

function pullTask() {
	return sync.pullAll(THEME_DIR);
}

function pullFastTask() {
	return sync.pullAll(THEME_DIR, {
		skipFiles : ['pdf'],  // skip files with ".pdf" extension
		skipSize : 1048576 // skip files > 1Mo
	});
}

function deployTask() {
	return sync.pushAll(THEME_DIR);
}

function watchTask() {
	sync.watch(watch(`${THEME_DIR}/**`, { events: 'all' }));
	
    watch([`${THEME_DIR}/fr/assets/js/*.js`, `!${THEME_DIR}/fr/assets/js/compact.min.js`], { events: 'change' }, compressJS)
    watch([`${THEME_DIR}/fr/assets/css/*.css`, `!${THEME_DIR}/fr/assets/css/compact.min.css`], { events: 'change' }, compressCSS)
}

async function pushTask(done) {
	const args = process.argv.slice(3);

	const fileArg = args.find(arg => arg.startsWith('--file='));
	const filePath = fileArg ? fileArg.split('=')[1] : '';

	if (filePath === '') {
		console.log('Missing --file= argument');
		done();
		return;
	}
	
	if (!filePath.startsWith(`${THEME_DIR}/`)) {
		console.log(`Argument --file should begin with ${THEME_DIR}/, like "--file=${THEME_DIR}/theme.xml"`);
		done();
		return;
	}

	if (!fs.existsSync(`./${filePath}`)) {
		console.log(`File ${filePath} not found`);
		done();
		return;
	}
	
	const stats = fs.statSync(`./${filePath}`);
	if (!stats.isFile()) {
		console.log(`File ${filePath} not found`);
		done();
		return;
	}

	await sync.ftpPut(`${filePath}`);
	sync.close();
	done();
}

function compressJS() {
    return src([
        'jquery-3.2.1.min.js',
        'moment-with-locales.min.js',
        'bootstrap-datetimepicker.min.js',
        'lightbox.min.js',
        'owl.carousel.min.js',
        'easyzoom.min.js',
        'jarallax.min.js',
        'js.cookie.min.js',
        'underscore-min.js',
        'kiubi.js'
    ], {cwd:`${THEME_DIR}/fr/assets/js`})
    .pipe(minify({
        ignoreFiles: ['*.min.js'],
		noSource: true
    }))
    .pipe(concat('compact.min.js'))
    .pipe(dest(`${THEME_DIR}/fr/assets/js`))
}

function compressCSS() {
    return src([
        'feather.css',
        'lightbox.min.css',
        'owl.carousel.min.css',
        'bootstrap-datetimepicker.min.css',
        'aos.min.css',
    ], {cwd:`${THEME_DIR}/fr/assets/css`})
    .pipe(cleanCSS())
    .pipe(concat('compact.min.css'))
    .pipe(dest(`${THEME_DIR}/fr/assets/css`))
}

exports.pull = pullTask;
exports.pullFast = pullFastTask;

exports.deploy = series(parallel(compressJS, compressCSS), deployTask);
exports.push = pushTask;

exports.watch = watchTask;

exports.compress = parallel(compressJS, compressCSS);

