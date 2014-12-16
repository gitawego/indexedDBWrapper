import BaseEvented from './BaseEvented';
import {helper} from './helper';
import {IDBStore} from './IDBStore';
/**
 * this class depends on axemclion/IndexedDBShim
 * @class com.sesamtv.core.util.store.IndexedDBStore
 * @extends com.sesamtv.core.util.BaseEvented
 */
export default
class IndexedDBWrapper extends BaseEvented {

    constructor(config) {
        this.config = {
            dbName: '',
            version: 1,
            operatorMapping: {
                "eq": "=",
                "gt": ">",
                "gte": ">=",
                "lt": "<",
                "lte": "<="
            },
            forceShim: false,
            timeFormat: /^(\d{4})(-(\d{2}))??(-(\d{2}))??(T(\d{2}):(\d{2})(:(\d{2}))??(\.(\d+))??(([\+\-]{1}\d{2}:\d{2})|Z)??)??$/,
            schema: {}
        };
        config && helper.mixin(this.config, config);
        super();


    }

    indexedDB() {
        return window.indexedDB
            || window.msIndexedDB
            || window.mozIndexedDB
            || window.webkitIndexedDB;
    }

    open(dbConfig) {
        var self = this;
        this.config.dbName = dbConfig.dbName;
        this.config.version = dbConfig.version;
        return new Promise((resolve, reject) => {
            var req = this.indexedDB().open(this.config.dbName, this.config.version);
            req.onsuccess = function (evt) {
                // Better use "this" than "req" to get the result to avoid problems with
                // garbage collection.
                // db = req.result;
                self.db = this.result;
                self.db.onerror = function (evt) {
                    self.emit('error', evt.target.error.message);
                };
                resolve(self.db);

            };
            req.onerror = reject;
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

    schema(schemas) {
        this.config.schema = schemas;
        schemas.forEach(function (schema) {
            if (schema.version > this.config.oldVersion) {
                this._schema(schema.schema);
            }
        }, this);
    }

    /**
     *
     * @param schema
     */
    _schema(schema) {
        var self = this;
        var thisDB = this.db;
        Object.keys(schema).forEach(function (storeName) {
            var storeConf = schema[storeName], objectStore;
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

    store(storeName) {
        if (this.db.objectStoreNames.contains(storeName)) {
            return new IDBStore(this, storeName);
        }
    }

    /**
     * {"put":[],"delete":[]}
     * @param {Object} items
     * @param {String} [storeName]
     * @returns {Promise}
     */
    bulk(items, storeName) {
        return new Promise((resolve, reject)=> {
            var i = 0, parsedItems = [],
                itemStore = this.getStore(storeName, 'readwrite', {
                    onerror: reject
                }), res = [];

            if (Array.isArray(items)) {
                parsedItems = items.map(function (data) {
                    return {
                        method: 'put',
                        data: data
                    };
                });
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
                if (i > 0) {
                    res.push(this.result);
                }
                var req;
                if (i < parsedItems.length) {
                    req = itemStore[parsedItems[i].method](parsedItems[i].data);
                    req.onsuccess = putNext;
                    //req.onerror = errHandler;
                    ++i;
                } else {   // complete
                    resolve({
                        results: res,
                        store: storeName
                    });
                }
            }

            putNext();
        });
    }

    getStore(storeName, mode, opt) {
        var trans = this.openTransaction(storeName, mode, opt);
        return trans.objectStore(storeName);
    }

    openTransaction(storeName, mode, opt) {
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

    dropDB() {
        this.db.close();
        return this.indexedDB().deleteDatabase(this.config.dbName);
    }

}
