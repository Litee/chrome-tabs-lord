/* global require, __dirname */
/*eslint strict: ["error", "global"]*/

'use strict';
const gulp = require('gulp');
const ts = require('gulp-typescript');
const sourcemaps = require('gulp-sourcemaps');
const tslint = require('gulp-tslint');
const zip = require('gulp-zip');
const del = require('del');
const KarmaServer = require('karma').Server;

const distExplodedDir = 'dist_exploded';
const distScriptsDir = distExplodedDir + '/scripts';
const distTestsDir = distExplodedDir + '/tests';

gulp.task('clean', () => {
  return del(distExplodedDir);
});

gulp.task('ts-lint', () => {
  return gulp.src('src/scripts/*.ts')
  .pipe(tslint())
  .pipe(tslint.report('prose', {
    summarizeFailureOutput: true
  }));
});

gulp.task('build-browser-action', ['ts-lint'], () => {
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

gulp.task('build-sidebar', ['ts-lint'], () => {
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

gulp.task('build-tests', ['ts-lint'], () => {
  return gulp.src(['src/scripts/*.tests.ts', 'src/scripts/*.ts'])
    .pipe(sourcemaps.init())
    .pipe(ts({
      noLib: true,
      target: 'es2015',
      removeComments : true
    }))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(distTestsDir));
});

gulp.task('copy-other-files', () => {
  return gulp.src(['src/**/*.*', '!src/**/*.ts'])
    .pipe(gulp.dest(distExplodedDir));
});

gulp.task('package', ['build-browser-action', 'build-sidebar', 'copy-other-files'], () => {
  return gulp.src(['dist_exploded/**/*.*', 'LICENSE', '!dist_exploded/tests/**/*.*', '!dist_exploded/scripts/jasmine-jquery/**/*.*'])
    .pipe(zip('tabs-lord-extension-' + new Date().toJSON().replace(new RegExp(':', 'g'), '-') + '.zip'))
    .pipe(gulp.dest('dist'));
});

gulp.task('default', ['clean'], () => { gulp.start('package'); });

gulp.task('karma', ['build-browser-action', 'build-sidebar', 'build-tests', 'copy-other-files'], (done) => {
  new KarmaServer({
    configFile: __dirname + '/karma.conf.js',
    singleRun: true
  }, done).start();
});

gulp.task('clean-and-test', ['clean'], () => {
  gulp.start('karma');
});

gulp.task('watch', () => {
  gulp.watch('src/**/*', ['clean-and-test']);
});
