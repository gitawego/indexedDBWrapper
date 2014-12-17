import BaseEvented from './BaseEvented';
import {helper} from './helper';
import IDBStore from './IDBStore';
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
            stores: {},
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
        if (this.config.stores[storeName]) {
            return this.config.stores[storeName];
        }
        if (this.db.objectStoreNames.contains(storeName)) {
            return this.config.stores[storeName] = new IDBStore(this, storeName);
        }
    }

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
    bulk(items, storeName) {
        var self = this;
        return new Promise((resolve, reject)=> {
            var parsedItems = [], item,
                itemStore = this.getStore(storeName, 'readwrite', {
                    onerror: function (evt) {
                        var error = evt.target.error;
                        error.item = item;
                        reject(error);
                    }
                }), res = [];

            if (!Array.isArray(items)) {
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
                                req = itemStore.index(item.data.index)
                                    .get(Array.isArray(item.data.key) ? item.data.key.map(function (k) {
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
                        }
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

    getStore(storeName, mode, opt) {
        var trans = this.openTransaction(storeName, mode, opt);
        return trans.objectStore(storeName);
    }

    mergeData(src, data) {
        Object.keys(data).forEach(function (k) {
            if (data[k] === null) {
                delete src[k];
            } else {
                src[k] = data[k];
            }
        });
        return src;
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
