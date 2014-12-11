import BaseEvented from './BaseEvented';
import {helper} from './helper';
import {IDBStore} from './IDBStore';
var exampleStru = {
    "schema": [{
        "version": 1,
        "schema": {
            "store1": {
                "keyPath": {
                    "keyPath": "id",
                    "autoIncrement": true
                },
                "indexes": {
                    "indexId1": {
                        "index": "index1",
                        "unique": true
                    }
                }
            },
            "store2": {
                "keyPath": {
                    "keyPath": "id",
                    "autoIncrement": true
                },
                "alter": [
                    {
                        "action": "removeIndex",
                        "param": ["index1"]
                    },
                    {
                        "action": "clear"
                    }
                ],
                "indexes": {
                    "indexid2": {
                        "index": "index2",
                        "unique": false
                    }
                }
            }
        }
    }]
};
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
                if (!self.config.schema) {
                    resolve(self.db);
                }

            };
            req.onerror = reject;
            req.onupgradeneeded = function (e) {
                self.db = this.result;
                if (!dbConfig.schema || dbConfg.schema.length === 0) {
                    throw new Error('no schema defined, can not upgrade');
                }
                if (e.oldVersion >= dbConfg.schema[dbConfg.schema.length - 1].version) return;
                self.config.oldVersion = e.oldVersion;
                self.schema(dbConfig.schema);
                resolve(self.db);
            };
        });
    }

    schema(schemas) {
        this.config.schema = schemas;
        schemas.forEach(function (schema) {
            if (schema.version > this.config.oldVersion) {
                this._schema(schema);
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
                    if (self.config.isShim && Array.isArray(idxConf.index)) {
                        return;
                    }
                    objectStore.createIndex(idxName, idxConf.index, {
                        unique: idxConf.unique
                    });
                });
            }
        }, this);
    }

    store(storeName) {
        this.config.currentStore = storeName;
        return new IDBStore(this.db);
    }

    /**
     * {"update":[],"delete":[]}
     * @param {Object} items
     * @param {String} [storeName]
     * @returns {Promise}
     */
    bulk(items, storeName) {
        return new Promise((resolve, reject)=> {
            storeName = storeName || this.config.currentStore;
            var i = 0, parsedItems = [],
                errHandler = function (event) {
                    // Generic error handler for all errors targeted at this database's requests
                    reject(event.target.error);
                }, itemStore = this.getStore(storeName, 'readwrite'), res = [];

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

            function putNext() {
                if (i > 0) {
                    res.push(this.result);
                }
                if (i < parsedItems.length) {
                    var req = itemStore[parsedItems[i].method](parsedItems[i].data);
                    req.onsuccess = putNext;
                    req.onerror = errHandler;
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

    getStore(storeName, mode) {
        return this.openTransaction(storeName, mode).objectStore(storeName);
    }

    openTransaction(storeName, mode) {
        return this.db.transaction(storeName, mode);
    }


    dropDB() {
        this.db.close();
        return this.indexedDB().deleteDatabase(this.config.dbName);
    }

}
