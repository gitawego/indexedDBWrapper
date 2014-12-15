var gulp = require('gulp');
var sourcemaps = require('gulp-sourcemaps');
var to5 = require('gulp-6to5');
var concat = require('gulp-concat');
var wrapper = require('gulp-wrapper');
var uglify = require('gulp-uglify');


gulp.task('full', function () {
    return gulp.src('./lib/*.js')
        .pipe(sourcemaps.init())
        .pipe(to5({
            modules:"ignore"
        }))
        .pipe(concat('IndexedDBWrapper.js'))
        .pipe(wrapper({
            header:"\n (function(){ ",
            footer:"\n if (typeof define==='function' && define['amd']){define(function(){return IndexedDBWrapper;});}" +
            "else if (typeof module !=='undefined' && module['exports']){module['exports']=IndexedDBWrapper;}else if " +
            "(typeof this !=='undefined'){this['IndexedDBWrapper']=IndexedDBWrapper;}  }).bind(window)();"
        }))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
});

gulp.task('compressed', function () {
    return gulp.src('./lib/*.js')
        .pipe(sourcemaps.init())
        .pipe(to5({
            modules:"ignore"
        }))
        .pipe(concat('IndexedDBWrapper.min.js'))
        .pipe(wrapper({
            header:"\n (function(){ ",
            footer:"\n if (typeof define==='function' && define['amd']){define(function(){return IndexedDBWrapper;});}" +
            "else if (typeof module !=='undefined' && module['exports']){module['exports']=IndexedDBWrapper;}else if " +
            "(typeof this !=='undefined'){this['IndexedDBWrapper']=IndexedDBWrapper;}  }).bind(window)();"
        }))
        .pipe(uglify())
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest('dist'));
});

gulp.task('default',['full','compressed']);