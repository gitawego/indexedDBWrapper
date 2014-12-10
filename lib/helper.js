"use strict";
let slice = Array.prototype.slice;
/**
 * @class com.sesamtv.core.util.Helper
 */
export var helper = {
    /**
     * create a sandboxed function
     *
     *      var fnc = sandbox(['id','name'],'alert("id");');
     *      //it will throw an error "undefined is not a function", because alert is disabled
     *      fnc(10,'my name');
     *
     *      var fnc = sandbox(['id'], 'document.querySelector("#"+id)');
     *      //it will throw an error because document is disabled
     *      fnc('container');
     *
     *      //to give the access of document to the function
     *      var fnc = sandbox(['id'],'return document.querySelector("#"+id);',{
         *          shim:{
         *              'document':document
         *          }
         *      });
     *      //or only partially
     *      var fnc = sandbox(['id'],'return document.querySelector("#"+id);',{
         *          shim:{
         *              'document':{
         *                  "querySelector":document.querySelector
         *              }
         *          }
         *      });
     *      fnc('menu');
     *
     *
     * @method sandbox
     * @param {Array.<String>} param
     * @param {String} context
     * @param {Object} opt
     * @param {Array.<String>} [opt.restrictedVars] restricted variables
     * @param {Object} [opt.shim] shim the restricted variables
     * @param {Object} [opt.scope]
     * @returns {Function}
     */
    sandbox: function sandbox(param, context, opt) {
        opt = opt || {};
        var restrictedVars = ['window', 'document', 'alert', 'location', 'openDatabase', 'indexedDB',
                'console', 'close', 'setTimeout', 'setInterval', 'open', 'localStorage', 'sessionStorage',
                'parent', 'self', 'addEventListener', 'dispatchEvent', 'postMessage', 'WebSocket', 'Blob',
                'require', 'define', '$'].concat(opt.restrictedVars || []),
            paramLen = param.length, fnc, argLen = 0, args, shimIndex = 0, foundShim, totalShim,
            emptyVars = new Array(restrictedVars.length), shimKeys, shimKey,
            splice = Array.prototype.splice;

        if (opt.shim) {
            shimKeys = Object.keys(opt.shim);
            for (totalShim = shimKeys.length; shimIndex < totalShim; shimIndex++) {
                shimKey = shimKeys[shimIndex];
                foundShim = restrictedVars.indexOf(shimKey);
                if (foundShim === -1) {
                    continue;
                }
                emptyVars.splice(foundShim, 1, opt.shim[shimKey]);
            }
        }

        param = param.concat(restrictedVars);
        fnc = new Function(param.join(','), context);
        return function () {
            args = splice.call(arguments, 0, paramLen);
            args = args.concat(emptyVars);
            return fnc.apply(opt.scope || {}, args);
        };
    },

    debounce: function debounce(func, wait, immediate) {
        var timeout;
        return function () {
            var context = this, args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(function () {
                timeout = null;
                if (!immediate) func.apply(context, args);
            }, wait);
            if (immediate && !timeout) func.apply(context, args);
        };
    },
    randomIntFromInterval: function randomIntFromInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    },
    throttle: function throttle(fn, minDelay) {
        var lastCall = 0;
        return function () {
            var now = +new Date();
            if (now - lastCall < minDelay) {
                return;
            }
            lastCall = now;
            return fn.apply(this, arguments);
        };
    },
    /**
     * @method leftPad
     * @param {String|Number} result
     * @param {Number} size
     * @param {String} ch
     * @returns {string}
     */
    leftPad: function (result, size, ch) {
        result += '';
        if (!ch) {
            ch = " ";
        }
        while (result.length < size) {
            result = ch + result;
        }
        return result;
    },
    rightPad: function (result, size, ch) {
        result += '';
        if (!ch) {
            ch = " ";
        }
        while (result.length < size) {
            result = result + ch;
        }
        return result;
    },
    /**
     * async array processing without blocking the UI (useful when web worker is not available)
     * @method chunk
     * @param {Array} items
     * @param {Function} process
     * @param {Object} [context]
     * @param {Function} [callback]
     */
    chunk: function timedChunk(items, process, context, callback) {
        var todo = items.slice(0), i = 0;
        setTimeout(function worker() {
            var start = +new Date();
            do {
                process.call(context, todo.shift(), i++);
            } while (todo.length > 0 && (+new Date() - start < 50));
            if (todo.length > 0) {
                setTimeout(worker, 25);
            } else {
                callback(items);
            }
        }, 25);
    },
    /**
     * uppercase the first character
     * @method ucFirst
     * @param {String} str
     * @returns {String}
     */
    ucFirst: function (str) {
        str += '';
        var f = str.charAt(0).toUpperCase();
        return f + str.substr(1);
    },
    addSlashes: function (str) {
        return (str + '')
            .replace(/[\\"']/g, '\\$&')
            .replace(/\u0000/g, '\\0');
    },
    applyIf: function applyIf(dest, obj, override) {
        var key;
        for (key in obj) {
            if (obj.hasOwnProperty(key) && (!(key in dest) || override)) {
                dest[key] = obj[key];
            }
        }
    },
    /**
     * @method substitute
     * @param {String} template
     * @param {Object|Array} [map] if map is not defined, return a function with predefined template
     * @param {Function} [transform]
     * @param {Object} [thisObject] scope
     * @returns {String|Function}
     */
    substitute: function (template, map, transform, thisObject) {
        var self = this, run = function (data) {
            return template.replace(/\$\{([^\s\:\}]+)(?:\:([^\s\:\}]+))?\}/g,
                function (match, key, format) {
                    var value = self.getObject(key, false, data);
                    if (format) {
                        value = self.getObject(format, false, thisObject).call(thisObject, value, key);
                    }
                    return transform(value, key).toString();
                });
        };
        thisObject = thisObject || typeof(window) === 'undefined' ? global : window;
        transform = transform ?
            transform.bind(thisObject) : function (v) {
            return v;
        };
        return map ? run(map) : function (map) {
            return run(map);
        };
    },
    /**
     * @method taskBuffer
     * @param {Array.<function(next:function)>} tasks
     * @param {Object} [scope]
     * @returns {{on: Function}}
     */
    taskBuffer: function taskBuffer(tasks, scope) {
        var slice = Array.prototype.slice, args = arguments, task, on = {}, error;

        function next() {
            if (task = tasks.shift()) {
                task.apply(scope, [next].concat(slice.call(arguments, 0)));
            } else {
                on.done && on.done();
            }
        }

        next.error = function (err) {
            error = err || 'unknown error';
            on.error && on.error(err, tasks);
        };
        setTimeout(function () {
            next.apply(scope, slice.call(args, 2));
        }, 0);
        return {
            on: function (evtName, fnc) {
                on[evtName] = fnc;
                if (error) {
                    on.error && on.error(error, tasks);
                } else if (tasks.length === 0) {
                    on.done && on.done();
                }
            }
        }
    },
    taskBufferAsync: function (tasks, finished, options) {
        options = options || {};
        var total = tasks.length, task;
        var done = function (err) {
            total--;
            if (!total || err) {
                finished && finished(err);
            }
        };
        var run = function () {
            if (!tasks.length) {
                return console.warn("taskBufferAsync - no task appending");
            }
            while (task = tasks.shift()) {
                if ('then' in task) {
                    task.then(done);
                } else {
                    task(done);
                }
            }
        };
        if (options.standby) {
            return {
                run: function () {
                    return run();
                }
            };
        }
        return run();
    },
    /**
     * @method shallowMixin
     * @param {Object} dest
     * @param {Object} source
     * @returns {Object}
     */
    shallowMixin: function (dest, source) {
        var keys = Object.keys(source), name;
        while ((name = keys.shift())) {
            dest[name] = source[name];
        }
        return dest;
    },
    /**
     * @method mixin
     * @param {Object} dest
     * @param {Object} source
     * @param {Function} [cpFunc]
     * @returns {Object}
     */
    mixin: function (dest, source, cpFunc) {
        var name, s, empty = {};
        for (name in source) {
            s = source[name];
            if (!(name in dest) ||
                (dest[name] !== s && (!(name in empty) || empty[name] !== s))) {
                dest[name] = cpFunc ? cpFunc(s) : s;
            }
        }
        return dest;
    },
    /**
     * @method merge
     * @param {Object} target
     * @param {Object} source
     * @param {Boolean} [nonStrict]
     * @returns {*}
     */
    merge: function merge(target, source, nonStrict) {
        var tval, sval, name;
        for (name in source) {
            if (!nonStrict && !source.hasOwnProperty(name)) {
                continue;
            }
            tval = target[name];
            sval = source[name];
            if (tval !== sval) {
                if (tval && typeof tval === 'object' && sval && typeof sval === 'object') {
                    merge(tval, sval, nonStrict);
                } else {
                    target[name] = sval;
                }
            }
        }
        return target;
    },
    /**
     * according to [The structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/Guide/DOM/The_structured_clone_algorithm)
     * @method deepClone
     * @param {Object} oToBeCloned
     * @returns {Object}
     */
    deepClone: function deepClone(oToBeCloned) {
        if (!oToBeCloned || typeof oToBeCloned !== "object" || typeof(oToBeCloned) === 'function') {
            // null, undefined, any non-object, or function
            return oToBeCloned;	// anything
        }
        var oClone, FConstr = oToBeCloned.constructor;

        if (typeof(HTMLElement) !== 'undefined' && oToBeCloned instanceof HTMLElement) {
            oClone = oToBeCloned.cloneNode(true);
        } else if (oToBeCloned instanceof RegExp) {
            oClone = new RegExp(oToBeCloned.source,
                "g".substr(0, Number(oToBeCloned.global)) +
                "i".substr(0, Number(oToBeCloned.ignoreCase)) +
                "m".substr(0, Number(oToBeCloned.multiline)));
        } else if (oToBeCloned instanceof Date) {
            oClone = new Date(oToBeCloned.getTime());
        } else {
            oClone = FConstr ? new FConstr() : {};
            for (var sProp in oToBeCloned) {
                if (!oToBeCloned.hasOwnProperty(sProp)) {
                    continue;
                }
                oClone[sProp] = deepClone(oToBeCloned[sProp]);
            }
        }
        return oClone;
    },
    /**
     * example:
     *
     *      isType('Object')({toto:1});
     *
     * @method isType
     * @param {String} compare Object,String,Array,Function, etc.
     * @returns {Function}
     */
    isType: function isType(compare) {
        if (typeof compare === 'string' && /^\w+$/.test(compare)) {
            compare = '[object ' + compare + ']';
        } else {
            compare = Object.prototype.toString.call(compare);
        }
        return isType[compare] || (isType[compare] = function (o) {
                return Object.prototype.toString.call(o) === compare;
            });
    },
    /**
     * guess real type
     * @method realType
     * @param str
     * @returns {*}
     */
    realType: function (str) {
        var xml;
        if (typeof(str) !== 'string') {
            return str;
        }
        str = str.trim();
        if (str.trim() === "") {
            return str;
        }
        var mapping = ['true', 'false', 'null', 'undefined'];
        if (+str === 0 || +str) {
            return +str;
        }
        if (!!~mapping.indexOf(str.toLowerCase())) {
            return eval(str.toLowerCase());
        }
        try {
            return JSON.parse(str);
        } catch (e) {
        }
        xml = new DOMParser().parseFromString(str, 'text/xml');
        if (!xml.getElementsByTagName('parsererror').length) {
            return xml;
        }
        return str;
    },
    /**
     * @method castType
     * @param {*} value
     * @param {String} type
     * @returns {*}
     */
    castType: function (value, type) {
        var typeMapping = {
            "string": function (s) {
                return s + "";
            },
            "number": function (n) {
                return +n;
            },
            "array": function (arr) {
                if (Array.isArray(arr)) {
                    return arr;
                }
                try {
                    var tmp = JSON.parse(arr);
                    if (Array.isArray(tmp)) {
                        return tmp;
                    }
                } catch (e) {

                }
                return arr.split(',');
            },
            "boolean": function (value) {
                if (!value) {
                    value = false;
                } else {
                    value = ('' + value).toLowerCase();
                    value = value !== 'false';
                }
                return value;
            },
            "object": function (o) {
                try {
                    return JSON.parse(o);
                } catch (e) {
                    return null;
                }
            },
            "xml": function (str) {
                return new DOMParser().parseFromString(str, 'text/xml');
            }
        };
        if (arguments.length === 0) {
            return typeMapping;
        }
        return typeMapping[type] && typeMapping[type](value);
    },
    /**
     * @method getProp
     * @param {Array} parts
     * @param {Boolean} create
     * @param {Object} context
     * @return Object
     */
    getProp: function (parts, create, context) {
        var obj = context || window;
        for (var i = 0, p; obj && (p = parts[i]); i++) {
            obj = (p in obj ? obj[p] : (create ? obj[p] = {} : undefined));
        }
        return obj; // mixed
    },
    /**
     * @method getObject
     * @param {String} name
     * @param {Boolean} create
     * @param {Object} context
     * @return Object
     */
    getObject: function (name, create, context) {
        return this.getProp(name.split("."), create, context); // Object
    },

    /**
     * create a function with partial params
     *
     *      var fnc1 = function(a,b,c){return a+b+c;}, undef = {}.undef;
     *      var fnc2 = partial(fnc1,null,undef,2,undef);
     *      fnc2(1,3); //returns 6
     *      fnc2(1,1); //returns 4
     *
     * @method partial
     * @param {Function} fn
     * @param {Object} [scope]
     * @returns {Function}
     */
    partial: function partial(fn, scope) {

        var args = slice.call(arguments, 2);
        return function () {
            var arg = 0, i = 0, l = args.length;
            for (; i < l && arg < arguments.length; i++)
                if (args[i] === undefined)
                    args[i] = arguments[arg++];
            return fn.apply(scope, args);
        };
    },
    queryToObject: function (query, separator) {
        separator = separator || '&';
        query = query.trim();
        if (!query) {
            return;
        }
        var params = {};
        query.split(separator).forEach(function (part) {
            part = part.trim();
            if (!part) {
                return;
            }
            var p = part.split('=');
            params[p[0].trim()] = p[1].trim();
        });
        return params;
    },
    objectToQuery: function (obj, separator, fromJson) {
        separator = separator || '&';
        var query = [];
        Object.keys(obj).forEach(function (k) {
            var o = obj[k], tmp;
            if (typeof(o) === 'object' && fromJson) {
                try {
                    tmp = JSON.stringify(o);
                } catch (e) {
                    //
                }
                if (tmp !== undefined) {
                    o = encodeURIComponent(tmp);
                }
            }
            query.push(k + '=' + o);
        });
        return query.join(separator);
    },
    /**
     * Return an a object with the url being parsed and fully qualified
     * @param url to parse
     * @param baseUrl [optional] a base url to use to fully qualify the url
     */
    parseUrl: function (url, baseUrl) {
        var a = document.createElement('a');
        // testons d'abord que l'url ne contient pas dÃ©jÃ  les doubles ://
        if (!/:\/\//.test(url)) {
            a.href = baseUrl ? baseUrl : location.href;
        }
        a.href += url;

        return {
            hash: a.hash,
            host: a.host,
            hostname: a.hostname,
            href: a.href,
            pathname: a.pathname,
            port: a.port,
            protocol: a.protocol,
            search: a.search
        };
    },
    htmlentities: function htmlentities(string, quote_style, charset, double_encode) {
        //  discuss at: http://phpjs.org/functions/htmlentities/
        // original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        //  revised by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        //  revised by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // improved by: nobbler
        // improved by: Jack
        // improved by: RafaÅ‚ Kukawski (http://blog.kukawski.pl)
        // improved by: Dj (http://phpjs.org/functions/htmlentities:425#comment_134018)
        // bugfixed by: Onno Marsman
        // bugfixed by: Brett Zamir (http://brett-zamir.me)
        //    input by: Ratheous
        //  depends on: get_html_translation_table
        //   example 1: htmlentities('Kevin & van Zonneveld');
        //   returns 1: 'Kevin &amp; van Zonneveld'
        //   example 2: htmlentities("foo'bar","ENT_QUOTES");
        //   returns 2: 'foo&#039;bar'

        var hash_map = this.get_html_translation_table('HTML_ENTITIES', quote_style),
            symbol = '';
        string = string == null ? '' : string + '';

        if (!hash_map) {
            return false;
        }

        if (quote_style && quote_style === 'ENT_QUOTES') {
            hash_map["'"] = '&#039;';
        }

        if (!!double_encode || double_encode == null) {
            for (symbol in hash_map) {
                if (hash_map.hasOwnProperty(symbol)) {
                    string = string.split(symbol)
                        .join(hash_map[symbol]);
                }
            }
        } else {
            string = string.replace(/([\s\S]*?)(&(?:#\d+|#x[\da-f]+|[a-zA-Z][\da-z]*);|$)/g, function (ignore, text, entity) {
                for (symbol in hash_map) {
                    if (hash_map.hasOwnProperty(symbol)) {
                        text = text.split(symbol)
                            .join(hash_map[symbol]);
                    }
                }

                return text + entity;
            });
        }

        return string;
    },
    get_html_translation_table: function get_html_translation_table(table, quote_style) {
        //  discuss at: http://phpjs.org/functions/get_html_translation_table/
        // original by: Philip Peterson
        //  revised by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // bugfixed by: noname
        // bugfixed by: Alex
        // bugfixed by: Marco
        // bugfixed by: madipta
        // bugfixed by: Brett Zamir (http://brett-zamir.me)
        // bugfixed by: T.Wild
        // improved by: KELAN
        // improved by: Brett Zamir (http://brett-zamir.me)
        //    input by: Frank Forte
        //    input by: Ratheous
        //        note: It has been decided that we're not going to add global
        //        note: dependencies to php.js, meaning the constants are not
        //        note: real constants, but strings instead. Integers are also supported if someone
        //        note: chooses to create the constants themselves.
        //   example 1: get_html_translation_table('HTML_SPECIALCHARS');
        //   returns 1: {'"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;'}

        var entities = {},
            hash_map = {},
            decimal;
        var constMappingTable = {},
            constMappingQuoteStyle = {};
        var useTable = {},
            useQuoteStyle = {};

        // Translate arguments
        constMappingTable[0] = 'HTML_SPECIALCHARS';
        constMappingTable[1] = 'HTML_ENTITIES';
        constMappingQuoteStyle[0] = 'ENT_NOQUOTES';
        constMappingQuoteStyle[2] = 'ENT_COMPAT';
        constMappingQuoteStyle[3] = 'ENT_QUOTES';

        useTable = !isNaN(table) ? constMappingTable[table] : table ? table.toUpperCase() : 'HTML_SPECIALCHARS';
        useQuoteStyle = !isNaN(quote_style) ? constMappingQuoteStyle[quote_style] : quote_style ? quote_style.toUpperCase() :
            'ENT_COMPAT';

        if (useTable !== 'HTML_SPECIALCHARS' && useTable !== 'HTML_ENTITIES') {
            throw new Error('Table: ' + useTable + ' not supported');
            // return false;
        }

        entities['38'] = '&amp;';
        if (useTable === 'HTML_ENTITIES') {
            entities['160'] = '&nbsp;';
            entities['161'] = '&iexcl;';
            entities['162'] = '&cent;';
            entities['163'] = '&pound;';
            entities['164'] = '&curren;';
            entities['165'] = '&yen;';
            entities['166'] = '&brvbar;';
            entities['167'] = '&sect;';
            entities['168'] = '&uml;';
            entities['169'] = '&copy;';
            entities['170'] = '&ordf;';
            entities['171'] = '&laquo;';
            entities['172'] = '&not;';
            entities['173'] = '&shy;';
            entities['174'] = '&reg;';
            entities['175'] = '&macr;';
            entities['176'] = '&deg;';
            entities['177'] = '&plusmn;';
            entities['178'] = '&sup2;';
            entities['179'] = '&sup3;';
            entities['180'] = '&acute;';
            entities['181'] = '&micro;';
            entities['182'] = '&para;';
            entities['183'] = '&middot;';
            entities['184'] = '&cedil;';
            entities['185'] = '&sup1;';
            entities['186'] = '&ordm;';
            entities['187'] = '&raquo;';
            entities['188'] = '&frac14;';
            entities['189'] = '&frac12;';
            entities['190'] = '&frac34;';
            entities['191'] = '&iquest;';
            entities['192'] = '&Agrave;';
            entities['193'] = '&Aacute;';
            entities['194'] = '&Acirc;';
            entities['195'] = '&Atilde;';
            entities['196'] = '&Auml;';
            entities['197'] = '&Aring;';
            entities['198'] = '&AElig;';
            entities['199'] = '&Ccedil;';
            entities['200'] = '&Egrave;';
            entities['201'] = '&Eacute;';
            entities['202'] = '&Ecirc;';
            entities['203'] = '&Euml;';
            entities['204'] = '&Igrave;';
            entities['205'] = '&Iacute;';
            entities['206'] = '&Icirc;';
            entities['207'] = '&Iuml;';
            entities['208'] = '&ETH;';
            entities['209'] = '&Ntilde;';
            entities['210'] = '&Ograve;';
            entities['211'] = '&Oacute;';
            entities['212'] = '&Ocirc;';
            entities['213'] = '&Otilde;';
            entities['214'] = '&Ouml;';
            entities['215'] = '&times;';
            entities['216'] = '&Oslash;';
            entities['217'] = '&Ugrave;';
            entities['218'] = '&Uacute;';
            entities['219'] = '&Ucirc;';
            entities['220'] = '&Uuml;';
            entities['221'] = '&Yacute;';
            entities['222'] = '&THORN;';
            entities['223'] = '&szlig;';
            entities['224'] = '&agrave;';
            entities['225'] = '&aacute;';
            entities['226'] = '&acirc;';
            entities['227'] = '&atilde;';
            entities['228'] = '&auml;';
            entities['229'] = '&aring;';
            entities['230'] = '&aelig;';
            entities['231'] = '&ccedil;';
            entities['232'] = '&egrave;';
            entities['233'] = '&eacute;';
            entities['234'] = '&ecirc;';
            entities['235'] = '&euml;';
            entities['236'] = '&igrave;';
            entities['237'] = '&iacute;';
            entities['238'] = '&icirc;';
            entities['239'] = '&iuml;';
            entities['240'] = '&eth;';
            entities['241'] = '&ntilde;';
            entities['242'] = '&ograve;';
            entities['243'] = '&oacute;';
            entities['244'] = '&ocirc;';
            entities['245'] = '&otilde;';
            entities['246'] = '&ouml;';
            entities['247'] = '&divide;';
            entities['248'] = '&oslash;';
            entities['249'] = '&ugrave;';
            entities['250'] = '&uacute;';
            entities['251'] = '&ucirc;';
            entities['252'] = '&uuml;';
            entities['253'] = '&yacute;';
            entities['254'] = '&thorn;';
            entities['255'] = '&yuml;';
        }

        if (useQuoteStyle !== 'ENT_NOQUOTES') {
            entities['34'] = '&quot;';
        }
        if (useQuoteStyle === 'ENT_QUOTES') {
            entities['39'] = '&#39;';
        }
        entities['60'] = '&lt;';
        entities['62'] = '&gt;';

        // ascii decimals to real symbols
        for (decimal in entities) {
            if (entities.hasOwnProperty(decimal)) {
                hash_map[String.fromCharCode(decimal)] = entities[decimal];
            }
        }

        return hash_map;
    },
    /**
     * support commonjs and promise
     * @method async
     * @param {Function} makeGenerator a generator function which returns promise
     * @returns {Function}
     */
    async: function async(makeGenerator) {
        return function () {
            var generator = makeGenerator.apply(this, arguments);
            function handle(result) { // { done: [Boolean], value: [Object] }
                if (result.done) {
                    return result.value;
                }
                if (result.value.then) {
                    return result.value.then(function (res) {
                        return handle(generator.next(res));
                    }, function (err) {
                        return handle(generator.throw(err));
                    });
                } else {
                    return result.value(function (err, res) {
                        if (err) {
                            handle(generator.throw(err));
                        } else {
                            handle(generator.next(res));
                        }
                    });
                }
            }
            return handle(generator.next());
        }
    }
};
