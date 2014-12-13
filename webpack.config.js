var path = require('path');
var webpack = require('webpack');

var appModulesPath = path.join(path.resolve('lib/'));
var nodeModulesPath = path.join(__dirname, 'node_modules');
var bowerComponentsPath = path.join(__dirname, '/../bower_components');
var publicAssetsPath = path.join(path.resolve('app'), 'public', 'assets');
var themePath = path.join(path.resolve('app'), 'theme');


module.exports = {
    cache: true,

    context: appModulesPath,
    entry: 'IndexedDBWrapper.js',

    output: {
        path: path.resolve('./dist/'),
        publicPath: './',
        filename: "[name].js",
        chunkFilename: '[id].bundle.js'
    },

    // webpack-dev-server options
    contentBase: __dirname,

    resolve: {
        root: [appModulesPath],

//        modulesDirectories: ['bower_components', 'node_modules'],

        alias: {

        },
        extensions: [
            '',
            '.js', '.coffee',
            '.html', '.jade',
            '.css', '.styl', '.scss', '.less'
        ]
    },
    resolveLoader: {
        root: nodeModulesPath
    },

    plugins: [

    ],

    module: {
        loaders: [
            // Exports Angular

            { test: /\.json/, loader: "json" },
            //{ test: /\.js$/, loader: '6to5-loader' },
            { test: /^((?!(bower_components|node_modules)).)*.js$/, loader: '6to5-loader' }

        ],
        noParse:[
            /socket\.io\.js/,
            /treo\.js/
            ///angular-localForage.js/
        ]
    }

};