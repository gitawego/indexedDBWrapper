import CustomEvent from './CustomEvent';
import {helper} from './helper';

let slice = Array.prototype.slice;

/**
 * evented base component, use CustomEvent as compositor
 * @class com.sesamtv.core.util.BaseEvented
 * @requires com.sesamtv.core.util.CustomEvent
 */
export default class BaseEvented {
    constructor() {
        /**
         * @property event
         * @type {com.sesamtv.core.util.CustomEvent}
         */
        this.event = new CustomEvent();

        helper.applyIf(this, {
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

    /**
     * @method on
     * @param {String} evt
     * @param {Function} fnc
     * @param {Boolean} [once]
     * @returns {{id: Number, remove: Function}}
     */
    on(evt, fnc, once) {
        return this.event[once ? 'once' : 'on'](evt, fnc.bind(this));
    }

    /**
     * @method once
     * @param {String} evt
     * @param {Function} fnc
     * @returns {{id: Number, remove: Function}}
     */
    once(evt, fnc) {
        return this.on(evt, fnc.bind(this), true);
    }

    /**
     * @method emit
     * @returns {Array}
     */
    emit() {
        return this.event.emit.apply(this.event, arguments);
    }

    /**
     * @method broadcast
     * @param {String} wildcard
     */
    broadcast(wildcard) {
        return this.event.broadcast.apply(this.event, arguments);
    }

    /**
     * set a property
     * @method set
     * @param k
     * @param v
     */
    set(k, v) {
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
            res.oldValue = isObject(this[k]) ? helper.deepClone(this[k]) : this[k];
        }
        this[k] = v;
        this.emit(k, res);

    }

    /**
     * @method setConfigs
     * @param {Object} v
     */
    setConfigs(v) {
        Object.keys(v).forEach(function (k) {
            this.setConfig(k, v[k]);
        }, this);
    }

    /**
     * set a config property
     * @method setConfig
     * @param {String} k
     * @param {*} v
     */
    setConfig(k, v) {
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
            res.oldValue = isObject(this.config[k]) ? helper.deepClone(this.config[k]) : this.config[k];
        }
        this.config[k] = v;
        this.emit('config', res);
        this.emit('config/' + k, res);
    }

    /**
     * @method getConfig
     * @param {String} k
     * @returns {*}
     */
    getConfig(k) {
        var res = this.config[k], getter = k + 'Getter';
        if (this.config[getter]) {
            return this.config[getter](res, this);
        }
        return res;
    }

    removeEvts(evts) {
        evts.forEach(function (evt) {
            if (this.evts[evt]) {
                this.evts[evt].remove();
                delete this.evts[evt];
            }
        }, this);
    }

    /**
     * @method destroy
     */
    destroy() {

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
}
/**
 * eventize an object by composition
 * @method eventize
 * @static
 * @param {Object} self
 * @returns {Object}
 */
BaseEvented.eventize = function (self) {
    self.event = new CustomEvent();
    helper.applyIf(self, {
        evts: {},
        connect: [],
        config: {}
    });
    var proto = BaseEvented.prototype, supers = {};
    Object.keys(proto).forEach(function (k) {
        if (k in self && typeof(self[k]) === 'function') {
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
