;(function(){ /**
 * @license almond 0.3.0 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);

            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());
define('BaseEvented', ['exports', 'module', './CustomEvent', './helper'], function (exports, module, _CustomEvent, _helper) {
    'use strict';

    var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

    function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

    function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

    var _CustomEvent2 = _interopRequireDefault(_CustomEvent);

    var slice = Array.prototype.slice;

    /**
     * evented base component, use CustomEvent as compositor
     * @class com.sesamtv.core.util.BaseEvented
     * @requires com.sesamtv.core.util.CustomEvent
     */

    var BaseEvented = (function () {
        function BaseEvented() {
            _classCallCheck(this, BaseEvented);

            /**
             * @property event
             * @type {com.sesamtv.core.util.CustomEvent}
             */
            this.event = new _CustomEvent2['default']();

            _helper.helper.applyIf(this, {
                /**
                 * named listener handlers
                 * @property evts
                 * @type {Object}
                 */
                evts: {},
                /**
                 * anonymous listener handlers
                 * @property connect
                 * @type {Array}
                 */
                connect: [],
                config: {}
            });
        }

        _createClass(BaseEvented, [{
            key: 'on',

            /**
             * @method on
             * @param {String} evt
             * @param {Function} fnc
             * @param {Boolean} [once]
             * @returns {{id: Number, remove: Function}}
             */
            value: function on(evt, fnc, once) {
                return this.event[once ? 'once' : 'on'](evt, fnc.bind(this));
            }
        }, {
            key: 'once',

            /**
             * @method once
             * @param {String} evt
             * @param {Function} fnc
             * @returns {{id: Number, remove: Function}}
             */
            value: function once(evt, fnc) {
                return this.on(evt, fnc.bind(this), true);
            }
        }, {
            key: 'emit',

            /**
             * @method emit
             * @returns {Array}
             */
            value: function emit() {
                return this.event.emit.apply(this.event, arguments);
            }
        }, {
            key: 'broadcast',

            /**
             * @method broadcast
             * @param {String} wildcard
             */
            value: function broadcast(wildcard) {
                return this.event.broadcast.apply(this.event, arguments);
            }
        }, {
            key: 'set',

            /**
             * set a property
             * @method set
             * @param k
             * @param v
             */
            value: function set(k, v) {
                if (k === 'config') {
                    return this.setConfigs(v);
                }
                if (k in this && this[k] === v) {
                    return;
                }
                var res = {
                    newValue: v
                };
                if (k in this) {
                    res.oldValue = isObject(this[k]) ? _helper.helper.deepClone(this[k]) : this[k];
                }
                this[k] = v;
                this.emit(k, res);
            }
        }, {
            key: 'setConfigs',

            /**
             * @method setConfigs
             * @param {Object} v
             */
            value: function setConfigs(v) {
                Object.keys(v).forEach(function (k) {
                    this.setConfig(k, v[k]);
                }, this);
            }
        }, {
            key: 'setConfig',

            /**
             * set a config property
             * @method setConfig
             * @param {String} k
             * @param {*} v
             */
            value: function setConfig(k, v) {
                if (arguments.length === 1) {
                    return this.setConfigs(k);
                }
                if (k in this.config && this.config[k] === v) {
                    return;
                }
                var res = {
                    key: k,
                    newValue: v
                };
                if (k in this.config) {
                    res.oldValue = isObject(this.config[k]) ? _helper.helper.deepClone(this.config[k]) : this.config[k];
                }
                this.config[k] = v;
                this.emit('config', res);
                this.emit('config/' + k, res);
            }
        }, {
            key: 'getConfig',

            /**
             * @method getConfig
             * @param {String} k
             * @returns {*}
             */
            value: function getConfig(k) {
                var res = this.config[k],
                    getter = k + 'Getter';
                if (this.config[getter]) {
                    return this.config[getter](res, this);
                }
                return res;
            }
        }, {
            key: 'removeEvts',
            value: function removeEvts(evts) {
                evts.forEach(function (evt) {
                    if (this.evts[evt]) {
                        this.evts[evt].remove();
                        delete this.evts[evt];
                    }
                }, this);
            }
        }, {
            key: 'destroy',

            /**
             * @method destroy
             */
            value: function destroy() {

                this.connect.forEach(function (c) {
                    c.remove();
                });
                this.connect.length = 0;
                Object.keys(this.evts).forEach(function (e) {
                    this.evts[e].remove();
                }, this);
                this.evts = {};
                this.event.purgeListeners();
                this.$purgeSuper && this.$purgeSuper();
            }
        }]);

        return BaseEvented;
    })();

    module.exports = BaseEvented;

    /**
     * eventize an object by composition
     * @method eventize
     * @static
     * @param {Object} self
     * @returns {Object}
     */
    BaseEvented.eventize = function (self) {
        self.event = new _CustomEvent2['default']();
        _helper.helper.applyIf(self, {
            evts: {},
            connect: [],
            config: {}
        });
        var proto = BaseEvented.prototype,
            supers = {};
        Object.keys(proto).forEach(function (k) {
            if (k in self && typeof self[k] === 'function') {
                supers[k] = proto[k];
            } else {
                self[k] = proto[k];
            }
        });
        self.$super = function (k) {
            return supers[k] && supers[k].apply(this, slice.call(arguments, 1));
        };
        self.$purgeSuper = function () {
            supers = null;
        };
        return self;
    };
});
define('CustomEvent', ['exports', 'module'], function (exports, module) {
    'use strict';

    var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

    function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

    var slice = Array.prototype.slice,
        glb = typeof window !== 'undefined' ? window : global;

    var uuid = typeof glb.crypto != 'undefined' && typeof glb.crypto.getRandomValues != 'undefined' ? function () {
        // If we have a cryptographically secure PRNG, use that
        // http://stackoverflow.com/questions/6906916/collisions-when-generating-uuids-in-javascript
        var buf = new Uint16Array(8);
        glb.crypto.getRandomValues(buf);
        var S4 = function S4(num) {
            var ret = num.toString(16);
            while (ret.length < 4) {
                ret = '0' + ret;
            }
            return ret;
        };
        return S4(buf[0]) + S4(buf[1]) + '-' + S4(buf[2]) + '-' + S4(buf[3]) + '-' + S4(buf[4]) + '-' + S4(buf[5]) + S4(buf[6]) + S4(buf[7]);
    } : function uuid(tpl) {
        tpl = tpl || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
        var d = new Date().getTime();
        return tpl.replace(/[xy]/g, function (c) {
            var r = (d + Math.random() * 16) % 16 | 0;
            d = Math.floor(d / 16);
            return (c == 'x' ? r : r & 7 | 8).toString(16);
        });
    };
    var mixin = function mixin(dest, source) {
        var name,
            s,
            empty = {};
        for (name in source) {
            s = source[name];
            if (!(name in dest) || dest[name] !== s && (!(name in empty) || empty[name] !== s)) {
                dest[name] = s;
            }
        }
        return dest;
    };
    /**
     * @class com.sesamtv.core.util.CustomEvent
     * @cfg {Object} [args]
     * @cfg {String} [args.channelSeparator]
     */

    var CustomEvent = (function () {
        function CustomEvent(args) {
            _classCallCheck(this, CustomEvent);

            /**
             * @property _listeners
             * @type {Object.<String,Array>}
             * @private
             */
            this._listeners = {};
            this.channelSeparator = '/';
            args && mixin(this, args);
        }

        _createClass(CustomEvent, [{
            key: 'buildListener',

            /**
             * @method buildListener
             * @private
             * @param {Function|Object} listener
             * @return {{id:String,content:Function}}
             */
            value: function buildListener(listener) {
                var _id = '#Listener:' + uuid();
                if (typeof listener === 'function') {
                    listener = {
                        id: _id,
                        content: listener
                    };
                } else {
                    if (!listener.id) {
                        listener.id = _id;
                    }
                }
                return listener;
            }
        }, {
            key: 'on',

            /**
             * @method on
             * @param {String} eventName
             * @param {Function|Object} listener
             * @param {String} listener.id if listener is an object, define listener id
             * @param {Function} listener.content if listener is an object, define function
             * @return {{id:Number,remove:Function}}
             */
            value: function on(eventName, listener) {
                var self = this;
                if (typeof this._listeners[eventName] === 'undefined') {
                    this._listeners[eventName] = [];
                }
                listener = this.buildListener(listener);
                if (this.hasListener(eventName, listener.id)) {
                    throw new Error('listener id ' + listener.id + ' duplicated');
                }
                this._listeners[eventName].push(listener);
                return {
                    remove: function remove() {
                        return self.off(eventName, listener.id);
                    },
                    id: listener.id
                };
            }
        }, {
            key: 'once',

            /**
             * listener is triggered only once
             * @method once
             * @param {String} eventName
             * @param {Function|Object} listener
             * @param {Function} listener.content
             * @param {String} listener.id
             * @return {{id:Number,remove:Function}}
             */
            value: function once(eventName, listener) {
                var self = this;
                listener = this.buildListener(listener);
                var origContent = listener.content;
                listener.content = function () {
                    self.off(eventName, listener.id);
                    origContent.apply(self, arguments);
                };
                return this.on(eventName, listener);
            }
        }, {
            key: 'when',

            /**
             * listener is removed when the callback return true
             *
             *      this.when('click',function(node){
                     *          return node.id === 'container';
                     *      });
             *
             * @method when
             * @param {String} event
             * @param {Function} callback
             * @returns {*}
             */
            value: function when(event, callback) {
                var self = this;

                function check() {
                    if (callback.apply(this, arguments)) {
                        self.off(event, check);
                    }
                }

                check.listener = callback;
                self.on(event, check);
                return this;
            }
        }, {
            key: 'broadcast',

            /**
             * broadcast message to events, support wildcard (* or ?)
             *
             *      this.broadcast('channel1/*',message);
             *      this.broadcast('channel1/????/event1',message);
             *      this.broadcast('channel1/event1',msg1,msg2);
             *
             * @method broadcast
             * @param {String} wildcard
             */
            value: function broadcast(wildcard) {
                var params = slice.call(arguments, 1),
                    evtNames = this.getEventNamesByWildcard(wildcard),
                    i = 0,
                    l = evtNames.length,
                    res = [];
                for (; i < l; i++) {
                    res.push(this.emit.apply(this, [evtNames[i]].concat(params)));
                }
                return res;
            }
        }, {
            key: 'getEventNamesByWildcard',

            /**
             * @method getEventNamesByWildcard
             * @param {String} wildcard
             * @return {Array.<String>}
             */
            value: function getEventNamesByWildcard(wildcard) {
                var evts = [],
                    self = this,
                    reg = wildcard.replace(/(\?)/g, function (str, m) {
                    return '[\\w\'-]{1}';
                }).replace(/\*/g, function (key, idx, str) {
                    return str.charAt(idx + 1) !== '' ? '([\\S\\s][^' + self.channelSeparator + ']*)' : '.*?';
                });
                JSON.stringify(Object.keys(this._listeners)).replace(new RegExp('"(' + reg + ')"', 'g'), function (ignore, eventName) {
                    evts.push(eventName);
                });
                return evts;
            }
        }, {
            key: 'emit',

            /**
             * example:
             *
             *      this.emit('evtName');
             *      this.emit('evtName',params);
             *      this.emit('evtName',param1,param2);
             *
             * @method emit
             * @param {String} eventType
             * @return {Array}
             */
            value: function emit(eventType) {
                var params,
                    res = [],
                    listeners,
                    len;
                if (!eventType) {
                    //falsy
                    throw new Error('Event object missing \'eventName\' property.');
                }
                params = slice.call(arguments, 1);
                if (this._listeners[eventType] instanceof Array) {
                    listeners = this._listeners[eventType];
                    len = listeners.length;
                    //decrease the length (instead of increasing from 0)
                    // in case listener is removed while emit method is running
                    while (len--) {
                        if (listeners[len]) {
                            res.push({
                                id: listeners[len].id,
                                result: listeners[len].content.apply(this, params)
                            });
                        }
                    }
                }
                return res;
            }
        }, {
            key: 'emitTo',

            /**
             * emit to a particular listener
             *
             *      this.emitTo('eventName','listenerId',param1,param2);
             *
             * @method emitTo
             * @param eventType
             * @param listenerId
             * @returns {Array}
             */
            value: function emitTo(eventType, listenerId) {
                if (!eventType) {
                    //falsy
                    throw new Error('Event object missing \'eventName\' property.');
                }
                var params = slice.call(arguments, 2),
                    res = [],
                    listeners,
                    l;
                if (this._listeners[eventType] instanceof Array) {
                    listeners = this._listeners[eventType];
                    l = listeners.length;
                    while (l--) {
                        if (listeners[l] && listeners[l].id === listenerId) {
                            res.push({
                                id: listenerId,
                                result: listeners[l].content.apply(this, params)
                            });
                            break;
                        }
                    }
                    if (listenerId && !res.length) {
                        throw new Error('listener ' + listenerId + ' is not found in event ' + eventType);
                    }
                }
                return res;
            }
        }, {
            key: 'off',

            /**
             * remove a listener
             * @method off
             * @param {String} eventName
             * @param {String|Function} listener a listener id or listener handler
             */
            value: function off(eventName, listener) {
                var res;
                if (res = this.hasListener(eventName, listener)) {
                    this._listeners[eventName].splice(res.index, 1);
                }
            }
        }, {
            key: 'hasEvent',
            value: function hasEvent(eventName) {
                if (!eventName) {
                    return Object.keys(this._listeners).length > 0;
                }
                return eventName in this._listeners;
            }
        }, {
            key: 'eventList',
            value: function eventList() {
                return Object.keys(this._listeners);
            }
        }, {
            key: 'hasListener',

            /**
             * @method hasListener
             * @param {String} eventName
             * @param {String|Function} listener
             * @return {Object}
             */
            value: function hasListener(eventName, listener) {
                var listenerType = typeof listener === 'string' ? 'id' : 'content',
                    listeners,
                    i = 0,
                    len;
                if ((listeners = this._listeners[eventName]) && (len = listeners.length) > 0) {
                    for (; i < len; i++) {
                        if (listeners[i][listenerType] === listener) {
                            return {
                                index: i
                            };
                        }
                    }
                }
                return null;
            }
        }, {
            key: 'hasListeners',

            /**
             * @method hasListeners
             * @param {String} eventName event name
             * @return {Boolean}
             */
            value: function hasListeners(eventName) {
                if (this._listeners[eventName] instanceof Array) {
                    return this._listeners[eventName].length > 0;
                }
                return false;
            }
        }, {
            key: 'getListeners',

            /**
             * @method getListeners
             * @param {string} eventName event name
             * @return {Array.<Object>}
             */
            value: function getListeners(eventName) {
                if (this._listeners[eventName] instanceof Array) {
                    return this._listeners[eventName];
                }
            }
        }, {
            key: 'purgeListeners',

            /**
             * @method purgeListeners
             * @param {String} [evtName] if evtName is undefined, remove all the events
             */
            value: function purgeListeners(evtName) {
                if (evtName) {
                    delete this._listeners[evtName];
                } else {
                    delete this._listeners;
                    this._listeners = {};
                }
            }
        }]);

        return CustomEvent;
    })();

    module.exports = CustomEvent;
});
define('IDBStore', ['exports', 'module'], function (exports, module) {
    'use strict';

    var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

    function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

    var IDBStore = (function () {
        function IDBStore(db, storeName) {
            _classCallCheck(this, IDBStore);

            this.db = db;
            this.storeName = storeName;
        }

        _createClass(IDBStore, [{
            key: 'clear',
            value: function clear() {
                var store = this.db.getStore(this.storeName, 'readwrite');
                return new Promise(function (resolve, reject) {
                    var req = store.clear();
                    req.onsuccess = resolve;
                    req.onerror = function (evt) {
                        reject(evt.target.error);
                    };
                });
            }
        }, {
            key: 'drop',
            value: function drop() {
                var _this = this;

                return new Promise(function (resolve, reject) {
                    var itemStore = _this.db.getStore(_this.storeName, 'readwrite'),
                        req = itemStore['delete']();
                    req.onsuccess = resolve;
                    req.onerror = function (evt) {
                        reject(evt.target.error);
                    };
                });
            }
        }, {
            key: 'insert',
            value: function insert(item) {
                var itemStore = this.db.getStore(this.storeName, 'readwrite'),
                    req = itemStore.add(item);
                return new Promise(function (resolve, reject) {
                    req.onsuccess = function (res) {
                        item[itemStore.keyPath] = this.result;
                        resolve(item);
                    };
                    req.onerror = function (evt) {
                        reject(evt.target.error);
                    };
                });
            }
        }, {
            key: 'openTransaction',
            value: function openTransaction(mode) {
                return this.db.openTransaction(this.storeName, mode);
            }
        }, {
            key: 'upsert',
            value: function upsert(query, data, merge) {
                var _this2 = this;

                var tasks = [],
                    hasData;
                return new Promise(function (resolve, reject) {
                    _this2.query(query, {
                        openMode: 'readwrite',
                        onCursor: function onCursor(cursor, store, objectStore) {
                            hasData = true;
                            if (merge) {
                                data = _this2.db.mergeData(cursor.value, data);
                            }
                            data[objectStore.keyPath] = cursor.primaryKey;
                            tasks.push(_this2.cursorOperation(cursor, 'update', data));
                        }
                    }).then(function (res) {
                        if (!hasData) {
                            var objectStore = _this2.db.getStore(_this2.storeName, 'readwrite');
                            tasks.push(new Promise(function (resolve, reject) {
                                var req = objectStore.add(data);
                                req.onsuccess = function () {
                                    data[objectStore.keyPath] = this.result;
                                    resolve(data);
                                };
                                req.onerror = reject;
                            }));
                        }
                        if (!tasks.length) {
                            return resolve();
                        }
                        Promise.all(tasks).then(resolve, reject);
                    }, reject);
                });
            }
        }, {
            key: 'bulk',
            value: function bulk(items) {
                return this.db.bulk(items, this.storeName);
            }
        }, {
            key: 'removeByKey',
            value: function removeByKey(keyPathId) {
                var itemStore = this.db.getStore(this.storeName, 'readwrite'),
                    req = itemStore['delete'](keyPathId);
                return new Promise(function (resolve, reject) {
                    req.onsuccess = function () {
                        resolve(this.result);
                    };
                    req.onerror = function (evt) {
                        reject(evt.target.error);
                    };
                });
            }
        }, {
            key: 'remove',
            value: function remove(query) {
                var _this3 = this;

                var tasks = [];
                return new Promise(function (resolve, reject) {
                    _this3.query(query, {
                        openMode: 'readwrite',
                        onCursor: function onCursor(cursor) {
                            if (cursor) {
                                tasks.push(_this3.cursorOperation(cursor, 'delete'));
                            }
                        }
                    }).then(function () {
                        if (!tasks.length) {
                            return resolve();
                        }
                        Promise.all(tasks).then(resolve, reject);
                    }, reject);
                });
            }
        }, {
            key: 'cursorOperation',
            value: function cursorOperation(cursor, action, data) {
                return new Promise(function (resolve, reject) {
                    var req;
                    if (action !== 'delete') {
                        req = cursor[action](data);
                    } else {
                        req = cursor[action]();
                    }
                    req.onsuccess = function () {
                        resolve(this.source.value);
                    };
                    req.onerror = function (evt) {
                        reject(evt.target.error);
                    };
                });
            }
        }, {
            key: 'findByKey',
            value: function findByKey(keyValue) {
                var req = this.db.getStore(this.storeName, 'readwrite').get(keyValue);
                return new Promise(function (resolve, reject) {
                    req.onsuccess = function () {
                        resolve(this.result);
                    };
                    req.onerror = function (evt) {
                        reject(evt.target.error);
                    };
                });
            }
        }, {
            key: 'buildRange',
            value: function buildRange(query) {
                var range;
                query = query || {};
                if ('eq' in query) {
                    range = IDBKeyRange.only(query.eq);
                } else if ('gte' in query && 'lte' in query) {
                    range = IDBKeyRange.bound(query.gte, query.lte, true, true);
                } else if ('gte' in query && 'lt' in query) {
                    range = IDBKeyRange.bound(query.gte, query.lt, true, false);
                } else if ('gt' in query && 'lt' in query) {
                    range = IDBKeyRange.bound(query.gt, query.lt, false, false);
                } else if ('gt' in query && 'lte' in query) {
                    range = IDBKeyRange.bound(query.gt, query.lte, false, true);
                } else if ('gt' in query) {
                    range = IDBKeyRange.lowerBound(query.gt);
                } else if ('gte' in query) {
                    range = IDBKeyRange.lowerBound(query.gte, true);
                } else if ('lt' in query) {
                    range = IDBKeyRange.upperBound(query.lt);
                } else if ('lte' in query) {
                    range = IDBKeyRange.upperBound(query.lte, true);
                }
                return range;
            }
        }, {
            key: 'findOne',
            value: function findOne(query) {
                var _this4 = this;

                return new Promise(function (resolve, reject) {
                    _this4.query(query, {
                        onCursor: function onCursor() {
                            return false;
                        }
                    }).then(function (res) {
                        resolve(res[0]);
                    }, reject);
                });
            }
        }, {
            key: 'find',
            value: function find(query) {
                return this.query(query);
            }
        }, {
            key: 'query',

            /**
             *
             *  query({
             *      "eq":"admin",
             *      "index":"username",
             *      "filter":["$record.total > 10"]
             *  });
             *
             * @method query
             * @param {Object} query
             * @param {*} query.eq only
             * @param {*} query.gt lowerBound
             * @param {*} query.gte lowerBound with true
             * @param {*} query.lt upperBound
             * @param {*} query.lte upperBound with true
             * @param {Array|Function} query.filter
             * @param {String} [query.order] prev,prevunique,next,nextunique
             * @param {Object} [opt]
             * @param {String} [opt.openMode='readonly'] readwrite or readonly
             * @param {Function} [opt.onCursor]
             */
            value: function query(_query, opt) {
                opt = opt || {};
                opt.openMode = opt.openMode || 'readonly';
                _query = _query || {};
                _query.order = _query.order || 'next';
                var trans = this.openTransaction(opt.openMode),
                    objectStore = trans.objectStore(this.storeName),
                    reqStore,
                    self = this,
                    collect = [],
                    req,
                    range;
                range = this.buildRange(_query);
                reqStore = objectStore;
                if (range) {
                    if (_query.index && objectStore.indexNames.contains(_query.index)) {
                        reqStore = objectStore.index(_query.index);
                        req = reqStore.openCursor(range, _query.order);
                    } else {
                        req = reqStore.openCursor(range, _query.order);
                    }
                } else {
                    req = reqStore.openCursor();
                }

                var deferred = new Promise(function (resolve, reject) {
                    req.onsuccess = function (event) {
                        var queryCursor = event.target.result,
                            next = true;
                        if (queryCursor) {
                            if (_query.filter) {
                                if (!self.queryFilter(_query.filter, queryCursor)) {
                                    return queryCursor['continue']();
                                }
                            }
                            if (opt.onCursor) {
                                next = opt.onCursor(queryCursor, reqStore, objectStore) !== false;
                            }
                            collect.push(queryCursor.value);
                            if (next) {
                                queryCursor['continue']();
                            } else {
                                resolve(collect);
                            }
                        } else {
                            resolve(collect);
                        }
                    };

                    req.onerror = function (evt) {
                        console.warn(evt.target.error.message, evt.target.error.name);
                        reject(evt.target.error);
                    };
                });
                deferred.abort = function () {
                    req.readyState !== 'done' && trans.abort();
                };
                return deferred;
            }
        }, {
            key: 'queryFilter',
            value: function queryFilter(filter, cursor) {
                if (typeof filter === 'function') {
                    return filter(cursor);
                }
                var value = cursor.value;
                return new Function('$record', 'return ' + filter.join(' && ') + ' ;')(value);
            }
        }]);

        return IDBStore;
    })();

    module.exports = IDBStore;
});
define('IndexedDBWrapper', ['exports', 'module', './BaseEvented', './helper', './IDBStore'], function (exports, module, _BaseEvented2, _helper, _IDBStore) {
    'use strict';

    var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

    var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

    function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

    function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

    function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; }

    var _BaseEvented3 = _interopRequireDefault(_BaseEvented2);

    var _IDBStore2 = _interopRequireDefault(_IDBStore);

    /**
     * this class depends on axemclion/IndexedDBShim
     * @class com.sesamtv.core.util.store.IndexedDBStore
     * @extends com.sesamtv.core.util.BaseEvented
     */

    var IndexedDBWrapper = (function (_BaseEvented) {
        function IndexedDBWrapper(config) {
            _classCallCheck(this, IndexedDBWrapper);

            _get(Object.getPrototypeOf(IndexedDBWrapper.prototype), 'constructor', this).call(this);
            this.config = {
                dbName: '',
                version: 1,
                stores: {},
                operatorMapping: {
                    'eq': '=',
                    'gt': '>',
                    'gte': '>=',
                    'lt': '<',
                    'lte': '<='
                },
                forceShim: false,
                timeFormat: /^(\d{4})(-(\d{2}))??(-(\d{2}))??(T(\d{2}):(\d{2})(:(\d{2}))??(\.(\d+))??(([\+\-]{1}\d{2}:\d{2})|Z)??)??$/,
                schema: {}
            };
            config && _helper.helper.mixin(this.config, config);
        }

        _inherits(IndexedDBWrapper, _BaseEvented);

        _createClass(IndexedDBWrapper, [{
            key: 'indexedDB',
            value: function indexedDB() {
                return window.indexedDB || window.msIndexedDB || window.mozIndexedDB || window.webkitIndexedDB;
            }
        }, {
            key: 'open',
            value: function open(dbConfig) {
                var _this = this;

                var self = this;
                this.config.dbName = dbConfig.dbName;
                this.config.version = dbConfig.version;
                return new Promise(function (resolve, reject) {
                    var req = _this.indexedDB().open(_this.config.dbName, _this.config.version);
                    req.onsuccess = function (evt) {
                        // Better use "this" than "req" to get the result to avoid problems with
                        // garbage collection.
                        // db = req.result;
                        self.db = this.result;
                        self.db.onerror = function (evt) {
                            //global error
                            self.emit('error', evt.target.error.message);
                        };
                        resolve(self.db);
                    };
                    req.onerror = function (evt) {
                        reject(evt.target.error);
                    };
                    req.onupgradeneeded = function (e) {
                        console.log('onupgradeneeded');
                        self.db = this.result;
                        if (!dbConfig.schema || dbConfig.schema.length === 0) {
                            throw new Error('no schema defined, can not upgrade');
                        }
                        if (e.oldVersion >= dbConfig.schema[dbConfig.schema.length - 1].version) {
                            return;
                        }
                        self.config.oldVersion = e.oldVersion;
                        self.schema(dbConfig.schema);
                    };
                });
            }
        }, {
            key: 'schema',
            value: function schema(schemas) {
                this.config.schema = schemas;
                schemas.forEach(function (schema) {
                    if (schema.version > this.config.oldVersion) {
                        this._schema(schema.schema);
                    }
                }, this);
            }
        }, {
            key: '_schema',

            /**
             *
             * @param schema
             */
            value: function _schema(schema) {
                var thisDB = this.db;
                Object.keys(schema).forEach(function (storeName) {
                    var storeConf = schema[storeName],
                        objectStore;
                    if (thisDB.objectStoreNames.contains(storeName)) {
                        objectStore = thisDB.transaction([storeName], 'readwrite').objectStore(storeName);
                        //for upgrading
                        if (storeConf.alter) {
                            storeConf.alter.forEach(function (alter) {
                                if (alter.param) {
                                    objectStore[alter.action].apply(objectStore, alter.param);
                                } else {
                                    objectStore[alter.action]();
                                }
                            });
                        }
                    } else {
                        objectStore = thisDB.createObjectStore(storeName, storeConf.keyPath);
                    }
                    if (storeConf.indexes) {
                        Object.keys(storeConf.indexes).forEach(function (idxName) {
                            var idxConf = storeConf.indexes[idxName];
                            objectStore.createIndex(idxName, idxConf.index, {
                                unique: idxConf.unique
                            });
                        });
                    }
                }, this);
            }
        }, {
            key: 'store',
            value: function store(storeName) {
                if (this.config.stores[storeName]) {
                    return this.config.stores[storeName];
                }
                if (this.db.objectStoreNames.contains(storeName)) {
                    return this.config.stores[storeName] = new _IDBStore2['default'](this, storeName);
                }
            }
        }, {
            key: 'bulk',

            /**
             * items format:
             *
             *
             * {"put":[],"delete":[],"upsert":[{
             *  "index":"myIndex",
             *  "key":["_id","username"]
             *  "data":{
             *      "_id":123123,
             *      "username":"admin",
             *      "key":null
             *  },
             *  "merge":true
             * }]}
             *
             * or
             *
             *      [
             *          {method:'add',data:{...}},
             *          {method:'delete',data:keyPathValue},
             *          {method:'delete',data:indexValue,index:'id'}
             *      ]
             *
             * @param {Object} items
             * @param {String} [storeName]
             * @returns {Promise}
             */
            value: function bulk(items, storeName) {
                var _this2 = this;

                var self = this;
                return new Promise(function (resolve, reject) {
                    var parsedItems = [],
                        item,
                        itemStore = _this2.getStore(storeName, 'readwrite', {
                        onerror: function onerror(evt) {
                            var error = evt.target.error;
                            error.item = item;
                            reject(error);
                        }
                    }),
                        res = [];

                    if (Array.isArray(items)) {
                        parsedItems = items;
                    } else {
                        Object.keys(items).forEach(function (method) {
                            parsedItems = parsedItems.concat(items[method].map(function (data) {
                                return {
                                    method: method,
                                    data: data
                                };
                            }));
                        });
                    }

                    function putNext(evt) {
                        var req;
                        if (evt) {
                            res.push(this.result);
                        }
                        if (parsedItems.length) {
                            item = parsedItems.shift();
                            if (item.method === 'upsert') {
                                if (item.data.index) {
                                    if (itemStore.indexNames.contains(item.data.index)) {
                                        if (!item.data.key) {
                                            item.data.key = item.data.index;
                                        }
                                        req = itemStore.index(item.data.index).get(Array.isArray(item.data.key) ? item.data.key.map(function (k) {
                                            return item.data.data[k];
                                        }) : item.data.data[item.data.key]);
                                    } else {
                                        return reject(new Error('index name not found'));
                                    }
                                } else {
                                    req = itemStore.get(item.data.data[itemStore.keyPath]);
                                }
                                req.onsuccess = function (evt) {
                                    if (this.result) {
                                        if (item.data.merge) {
                                            item.data.data = self.mergeData(this.result, item.data.data);
                                        } else {
                                            if (item.data.key) {
                                                if (Array.isArray(item.data.key)) {
                                                    item.data.key.forEach(function (k) {
                                                        item.data.data[k] = this.result[k];
                                                    }, this);
                                                } else {
                                                    item.data.data[item.data.key] = this.result[item.data.key];
                                                }
                                            }
                                            item.data.data[itemStore.keyPath] = this.result[itemStore.keyPath];
                                        }
                                    }
                                    itemStore.put(item.data.data).onsuccess = putNext;
                                };
                            } else {
                                if (item.index) {
                                    req = itemStore.index(item.index)[item.method](item.data);
                                } else {
                                    req = itemStore[item.method](item.data);
                                }
                                req.onsuccess = putNext;
                            }
                        } else {
                            resolve({
                                results: res,
                                store: storeName
                            });
                        }
                    }

                    putNext();
                });
            }
        }, {
            key: 'getStore',
            value: function getStore(storeName, mode, opt) {
                var trans = this.openTransaction(storeName, mode, opt);
                return trans.objectStore(storeName);
            }
        }, {
            key: 'mergeData',
            value: function mergeData(src, data) {
                Object.keys(data).forEach(function (k) {
                    if (data[k] === null) {
                        delete src[k];
                    } else {
                        src[k] = data[k];
                    }
                });
                return src;
            }
        }, {
            key: 'openTransaction',
            value: function openTransaction(storeName, mode, opt) {
                opt = opt || {};
                var trans = this.db.transaction(storeName, mode);
                if ('oncomplete' in opt) {
                    trans.oncomplete = opt.oncomplete;
                }
                if ('onabort' in opt) {
                    trans.onabort = opt.onabort;
                }
                if ('onerror' in opt) {
                    trans.onerror = opt.onerror;
                }
                return trans;
            }
        }, {
            key: 'dropDB',
            value: function dropDB() {
                this.close();
                return this.indexedDB().deleteDatabase(this.config.dbName);
            }
        }, {
            key: 'close',
            value: function close() {
                return this.db.close();
            }
        }]);

        return IndexedDBWrapper;
    })(_BaseEvented3['default']);

    module.exports = IndexedDBWrapper;
});
define('helper', ['exports'], function (exports) {
    'use strict';
    Object.defineProperty(exports, '__esModule', {
        value: true
    });
    var slice = Array.prototype.slice;
    /**
     * @class com.sesamtv.core.util.Helper
     */
    var helper = {
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
            var restrictedVars = ['window', 'document', 'alert', 'location', 'openDatabase', 'indexedDB', 'console', 'close', 'setTimeout', 'setInterval', 'open', 'localStorage', 'sessionStorage', 'parent', 'self', 'addEventListener', 'dispatchEvent', 'postMessage', 'WebSocket', 'Blob', 'require', 'define', '$'].concat(opt.restrictedVars || []),
                paramLen = param.length,
                fnc,
                argLen = 0,
                args,
                shimIndex = 0,
                foundShim,
                totalShim,
                emptyVars = new Array(restrictedVars.length),
                shimKeys,
                shimKey,
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
                var context = this,
                    args = arguments;
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
        leftPad: function leftPad(result, size, ch) {
            result += '';
            if (!ch) {
                ch = ' ';
            }
            while (result.length < size) {
                result = ch + result;
            }
            return result;
        },
        rightPad: function rightPad(result, size, ch) {
            result += '';
            if (!ch) {
                ch = ' ';
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
            var todo = items.slice(0),
                i = 0;
            setTimeout(function worker() {
                var start = +new Date();
                do {
                    process.call(context, todo.shift(), i++);
                } while (todo.length > 0 && +new Date() - start < 50);
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
        ucFirst: function ucFirst(str) {
            str += '';
            var f = str.charAt(0).toUpperCase();
            return f + str.substr(1);
        },
        addSlashes: function addSlashes(str) {
            return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
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
        substitute: function substitute(template, map, transform, thisObject) {
            var self = this,
                run = function run(data) {
                return template.replace(/\$\{([^\s\:\}]+)(?:\:([^\s\:\}]+))?\}/g, function (match, key, format) {
                    var value = self.getObject(key, false, data);
                    if (format) {
                        value = self.getObject(format, false, thisObject).call(thisObject, value, key);
                    }
                    return transform(value, key).toString();
                });
            };
            thisObject = thisObject || typeof window === 'undefined' ? global : window;
            transform = transform ? transform.bind(thisObject) : function (v) {
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
            var slice = Array.prototype.slice,
                args = arguments,
                task,
                _on = {},
                error;

            function next() {
                if (task = tasks.shift()) {
                    task.apply(scope, [next].concat(slice.call(arguments, 0)));
                } else {
                    _on.done && _on.done();
                }
            }

            next.error = function (err) {
                error = err || 'unknown error';
                _on.error && _on.error(err, tasks);
            };
            setTimeout(function () {
                next.apply(scope, slice.call(args, 2));
            }, 0);
            return {
                on: function on(evtName, fnc) {
                    _on[evtName] = fnc;
                    if (error) {
                        _on.error && _on.error(error, tasks);
                    } else if (tasks.length === 0) {
                        _on.done && _on.done();
                    }
                }
            };
        },
        taskBufferAsync: function taskBufferAsync(tasks, finished, options) {
            options = options || {};
            var total = tasks.length,
                task;
            var done = function done(err) {
                total--;
                if (!total || err) {
                    finished && finished(err);
                }
            };
            var _run = function _run() {
                if (!tasks.length) {
                    return console.warn('taskBufferAsync - no task appending');
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
                    run: function run() {
                        return _run();
                    }
                };
            }
            return _run();
        },
        /**
         * @method shallowMixin
         * @param {Object} dest
         * @param {Object} source
         * @returns {Object}
         */
        shallowMixin: function shallowMixin(dest, source) {
            var keys = Object.keys(source),
                name;
            while (name = keys.shift()) {
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
        mixin: function mixin(dest, source, cpFunc) {
            var name,
                s,
                empty = {};
            for (name in source) {
                s = source[name];
                if (!(name in dest) || dest[name] !== s && (!(name in empty) || empty[name] !== s)) {
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
            if (!oToBeCloned || typeof oToBeCloned !== 'object' || typeof oToBeCloned === 'function') {
                // null, undefined, any non-object, or function
                return oToBeCloned; // anything
            }
            var oClone,
                FConstr = oToBeCloned.constructor;

            if (typeof HTMLElement !== 'undefined' && oToBeCloned instanceof HTMLElement) {
                oClone = oToBeCloned.cloneNode(true);
            } else if (oToBeCloned instanceof RegExp) {
                oClone = new RegExp(oToBeCloned.source, 'g'.substr(0, Number(oToBeCloned.global)) + 'i'.substr(0, Number(oToBeCloned.ignoreCase)) + 'm'.substr(0, Number(oToBeCloned.multiline)));
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
        realType: function realType(str) {
            var xml;
            if (typeof str !== 'string') {
                return str;
            }
            str = str.trim();
            if (str.trim() === '') {
                return str;
            }
            var mapping = ['true', 'false', 'null', 'undefined'];
            if (+str === 0 || +str) {
                return +str;
            }
            if (!! ~mapping.indexOf(str.toLowerCase())) {
                return eval(str.toLowerCase());
            }
            try {
                return JSON.parse(str);
            } catch (e) {}
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
        castType: function castType(value, type) {
            var typeMapping = {
                'string': function string(s) {
                    return s + '';
                },
                'number': function number(n) {
                    return +n;
                },
                'array': function array(arr) {
                    if (Array.isArray(arr)) {
                        return arr;
                    }
                    try {
                        var tmp = JSON.parse(arr);
                        if (Array.isArray(tmp)) {
                            return tmp;
                        }
                    } catch (e) {}
                    return arr.split(',');
                },
                'boolean': function boolean(value) {
                    if (!value) {
                        value = false;
                    } else {
                        value = ('' + value).toLowerCase();
                        value = value !== 'false';
                    }
                    return value;
                },
                'object': function object(o) {
                    try {
                        return JSON.parse(o);
                    } catch (e) {
                        return null;
                    }
                },
                'xml': function xml(str) {
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
        getProp: function getProp(parts, create, context) {
            var obj = context || window;
            for (var i = 0, p; obj && (p = parts[i]); i++) {
                obj = p in obj ? obj[p] : create ? obj[p] = {} : undefined;
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
        getObject: function getObject(name, create, context) {
            return this.getProp(name.split('.'), create, context); // Object
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
                var arg = 0,
                    i = 0,
                    l = args.length;
                for (; i < l && arg < arguments.length; i++) if (args[i] === undefined) args[i] = arguments[arg++];
                return fn.apply(scope, args);
            };
        },
        queryToObject: function queryToObject(query, separator) {
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
        objectToQuery: function objectToQuery(obj, separator, fromJson) {
            separator = separator || '&';
            var query = [];
            Object.keys(obj).forEach(function (k) {
                var o = obj[k],
                    tmp;
                if (typeof o === 'object' && fromJson) {
                    try {
                        tmp = JSON.stringify(o);
                    } catch (e) {}
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
        parseUrl: function parseUrl(url, baseUrl) {
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
                hash_map['\''] = '&#039;';
            }

            if (!!double_encode || double_encode == null) {
                for (symbol in hash_map) {
                    if (hash_map.hasOwnProperty(symbol)) {
                        string = string.split(symbol).join(hash_map[symbol]);
                    }
                }
            } else {
                string = string.replace(/([\s\S]*?)(&(?:#\d+|#x[\da-f]+|[a-zA-Z][\da-z]*);|$)/g, function (ignore, text, entity) {
                    for (symbol in hash_map) {
                        if (hash_map.hasOwnProperty(symbol)) {
                            text = text.split(symbol).join(hash_map[symbol]);
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
            useQuoteStyle = !isNaN(quote_style) ? constMappingQuoteStyle[quote_style] : quote_style ? quote_style.toUpperCase() : 'ENT_COMPAT';

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
                function handle(result) {
                    // { done: [Boolean], value: [Object] }
                    if (result.done) {
                        return result.value;
                    }
                    if (result.value.then) {
                        return result.value.then(function (res) {
                            return handle(generator.next(res));
                        }, function (err) {
                            return handle(generator['throw'](err));
                        });
                    } else {
                        return result.value(function (err, res) {
                            if (err) {
                                handle(generator['throw'](err));
                            } else {
                                handle(generator.next(res));
                            }
                        });
                    }
                }
                return handle(generator.next());
            };
        }
    };
    exports.helper = helper;
});

//
 this['IndexedDBWrapper']=require('IndexedDBWrapper');  }).bind(window)();
//# sourceMappingURL=IndexedDBWrapper.js.map