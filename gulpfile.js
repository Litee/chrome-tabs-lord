const gulp = require('gulp');
const zip = require('gulp-zip');

gulp.task('default', () => {
	return gulp.src(['src/**/*.*', 'LICENSE'])
		.pipe(zip('tabs-lord-extension-' + new Date().toJSON().replace(new RegExp(':', 'g'), '-') + '.zip'))
		.pipe(gulp.dest('dist'));
});