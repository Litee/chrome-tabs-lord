'use strict';
const gulp = require('gulp');
const ts = require('gulp-typescript');
const sourcemaps = require('gulp-sourcemaps');
const tslint = require('gulp-tslint');
const zip = require('gulp-zip');
const del = require('del');
const distExplodedDir = 'dist_exploded';
const distScriptsDir = distExplodedDir + '/scripts';

gulp.task('clean', () => {
  del(distExplodedDir);
});

gulp.task('copy-other-files', () => {
  return gulp.src(['src/**/*.*', '!src/**/*.ts'])
  .pipe(gulp.dest(distExplodedDir));
});

gulp.task('ts-lint', () => {
  return gulp.src('src/scripts/*.ts').pipe(tslint()).pipe(tslint.report('prose'));
});

gulp.task('build-browser-action', () => {
  return gulp.src(['src/scripts/browser-action.ts', 'src/scripts/util.ts'])
		.pipe(sourcemaps.init())
		.pipe(ts({
  noImplicitAny: true,
  out: 'browser-action.js',
  noLib: true,
  target: 'es2015',
  removeComments : true
		}))
		.pipe(sourcemaps.write('.'))
		.pipe(gulp.dest(distScriptsDir));
});

gulp.task('build-sidebar', () => {
  return gulp.src(['src/scripts/sidebar.ts', 'src/scripts/model.ts', 'src/scripts/util.ts'])
		.pipe(sourcemaps.init())
		.pipe(ts({
  noImplicitAny: true,
  out: 'sidebar.js',
  noLib: true,
  target: 'es2015',
  module: 'amd',
  removeComments : true
		}))
		.pipe(sourcemaps.write('.'))
		.pipe(gulp.dest(distScriptsDir));
});

gulp.task('package', () => {
  return gulp.src(['dist_exploded/**/*.*', 'LICENSE', '!dist_exploded/tests/**/*.*', , '!dist_exploded/scripts/jasmine-jquery/**/*.*'])
		.pipe(zip('tabs-lord-extension-' + new Date().toJSON().replace(new RegExp(':', 'g'), '-') + '.zip'))
		.pipe(gulp.dest('dist'));
});

gulp.task('default', ['clean', 'ts-lint', 'build-browser-action', 'build-sidebar', 'copy-other-files']);

gulp.task('watch', () => {
  gulp.watch('src/**/*', ['ts-lint', 'build-browser-action', 'build-sidebar', 'copy-other-files']);
});