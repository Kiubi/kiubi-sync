const { watch, src, pipe, dest, parallel, series } = require('gulp');
const minify = require('gulp-minify');
const concat = require('gulp-concat');
const cleanCSS = require('gulp-clean-css');
const kSync = require('kiubi-sync');

const config = require('./config.json');

const sync = new kSync({
	user: config.user,
	password: config.password
});

function pullTask() {
	return sync.pullAll('theme');
}

function pullFastTask() {
	return sync.pullAll('theme', {
		skipFiles : ['pdf'],  // skip files with ".pdf" extension
		skipSize : 1048576 // skip files > 1Mo
	});
}

function deployTask() {
	return sync.pushAll('theme');
}

function watchTask() {
	sync.watch(watch('theme/**', { events: 'all' }));
	
    watch(['theme/fr/assets/js/*.js', '!theme/fr/assets/js/compact.min.js'], { events: 'change' }, compressJS)
    watch(['theme/fr/assets/css/*.css', '!theme/fr/assets/css/compact.min.css'], { events: 'change' }, compressCSS)
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
	    ], {cwd:'theme/fr/assets/js'})
	    .pipe(minify({
	        ignoreFiles: ['*.min.js'],
			noSource: true
	    }))
	    .pipe(concat('compact.min.js'))
	    .pipe(dest('theme/fr/assets/js'))
	}
	
	function compressCSS() {
	    return src([
	        'feather.css',
	        'lightbox.min.css',
	        'owl.carousel.min.css',
	        'bootstrap-datetimepicker.min.css',
	        'aos.min.css',
	    ], {cwd:'theme/fr/assets/css'})
	    .pipe(cleanCSS())
	    .pipe(concat('compact.min.css'))
	    .pipe(dest('theme/fr/assets/css'))
	}

exports.pull = pullTask;
exports.pullFast = pullFastTask;

exports.deploy = series(parallel(compressJS, compressCSS), deployTask);

exports.watch = watchTask;

exports.compress = parallel(compressJS, compressCSS);

