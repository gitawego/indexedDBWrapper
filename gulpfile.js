var gulp = require('gulp');
var sourcemaps = require('gulp-sourcemaps');
var to5 = require('gulp-6to5');
var concat = require('gulp-concat');
var wrapper = require('gulp-wrapper');
var uglify = require('gulp-uglify');
var fs = require('fs');
var wrapperConf = {
    header: ";(function(){ "+fs.readFileSync('./node_modules/almond/almond.js'),
    footer: "\n this['IndexedDBWrapper']=require('IndexedDBWrapper')['default'];  }).bind(window)();"
};

gulp.task('full', function () {
    return gulp.src('./lib/*.js')
        .pipe(sourcemaps.init())
        .pipe(to5({
            modules: "amd",
            amdModuleIds:true
        }))
        .pipe(concat('IndexedDBWrapper.js'))
        .pipe(wrapper(wrapperConf))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
});

gulp.task('compressed', function () {
    return gulp.src('./lib/*.js')
        .pipe(sourcemaps.init())
        .pipe(to5({
            modules: "amd",
            amdModuleIds:true
        }))
        .pipe(concat('IndexedDBWrapper.min.js'))
        .pipe(wrapper(wrapperConf))
        .pipe(uglify({
            compress: {
                drop_console: true // <-
            }
        }))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
});

gulp.task('default', ['full', 'compressed']);