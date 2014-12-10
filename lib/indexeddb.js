import BaseEvented from './BaseEvented';
import {helper} from './helper';
var exampleStru = {
    "schema":[{
        "version":1,
        "schema":{
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
class IndexedDBWrapper extends BaseEvented{

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
        return new Promise((resolve,reject) => {
            var req = this.indexedDB().open(this.config.dbName, this.config.version);
            req.onsuccess = function (evt) {
                // Better use "this" than "req" to get the result to avoid problems with
                // garbage collection.
                // db = req.result;
                self.db = this.result;
                self.db.onerror = function (evt) {
                    self.emit('error', evt.target.error.message);
                };
                if(!self.config.schema){
                    resolve(self.db);
                }

            };
            req.onerror = reject;
            req.onupgradeneeded = function (e) {
                self.db = this.result;
                if(!dbConfig.schema || dbConfg.schema.length === 0){
                    throw new Error('no schema defined, can not upgrade');
                }
                if (e.oldVersion >= dbConfg.schema[dbConfg.schema.length-1].version) return;
                self.config.oldVersion = e.oldVersion;
                self.schema(dbConfig.schema);
                resolve(self.db);
            };
        });
    }
    schema(schemas){
        this.config.schema = schemas;
        schemas.forEach(function(schema){
            if(schema.version > this.config.oldVersion){
                this._schema(schema);
            }
        },this);
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
    store(storeName){
        this.config.currentStore = storeName;
        return this;
    }
    bulk(items, storeName) {
        return new Promise((resolve,reject)=>{
            storeName = storeName || this.config.currentStore;
            var self = this, i = 0,
                errHandler = function (event) {
                    // Generic error handler for all errors targeted at this database's requests
                    reject(event.target.error);
                };
            var itemStore = this.getStore(storeName, 'readwrite'), total = items.length;
            putNext();
            function putNext() {
                if (i < items.length) {
                    var req = itemStore.put(items[i]);
                    req.onsuccess = putNext;
                    req.onerror = errHandler;
                    ++i;
                } else {   // complete
                    console.log('populate complete');
                    resolve({
                        total:total,
                        store:storeName
                    });
                }
            }
        });
    }

    getStore(storeName, mode, db) {
        return this.openTransaction(storeName, mode, db).objectStore(storeName);
    }

    openTransaction(storeName, mode, db) {
        db = db || this.db;
        return db.transaction(storeName, mode);
    }

    clearStore(storeName) {
        storeName = storeName || this.config.currentStore;
        var store = this.getStore(storeName, 'readwrite');
        return new Promise(function(resolve,reject){
            var req = store.clear();
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    dropStore(storeName) {
        storeName = storeName || this.config.currentStore;
        return new Promise((resolve,reject)=>{
            var itemStore = this.getStore(storeName, 'readwrite'),
                req = itemStore['delete']();
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    add(item, storeName, isPut) {
        storeName = storeName || this.config.currentStore;
        var itemStore = this.getStore(storeName, 'readwrite'),
            req = itemStore[isPut ? 'put' : 'add'](item);
        return new Promise(function(resolve,reject){
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    /**
     * @method put
     * @param {Object} query
     * @param {Object|Function} newData
     * @param {String} [storeName]
     * @returns {*}
     */
    put(query, newData, storeName) {
        storeName = storeName || this.config.currentStore;
        var self = this, error;

        return new Promise(function(resolve,reject){
            self.query(query, storeName, {
                openMode: 'readwrite',
                onCursor: function (cursor) {
                    var item = typeof(newData) === 'function' ? newData(cursor.value) : helper.merge(cursor.value, newData);
                    var req = cursor.update(item);
                    req.onsuccess = function () {

                    };
                    req.onerror = function (err) {
                        error = err;
                    };
                }
            }, function (err) {
                if (err || error) {
                    return reject(err || error);
                }
                resolve();
            });
        });

    }

    removeById(keyPathId, storeName, callback) {
        storeName = storeName || this.config.currentStore;
        var itemStore = this.getStore(storeName, 'readwrite'),
            req = itemStore['delete'](keyPathId);
        return new Promise(function(resolve,reject){
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    remove(query, storeName, callback) {
        var self = this, tasks = [];
        return new Promise(function(resolve,reject){
            self.query(query, storeName, {
                openMode: 'readwrite',
                onCursor: function (cursor) {
                    tasks.push(self.removeById(cursor.primaryKey, storeName));
                }
            }, function (err) {
                if (err) {
                    return reject(err);
                }
                if (!tasks.length) {
                    return resolve();
                }
                Promise.all(tasks).then(resolve,reject);

            });
        });
    }

    byId(keyPathId, storeName, callback) {
        storeName = storeName || this.config.currentStore;
        var req = this.getStore(storeName, 'readwrite').get(keyPathId);
        return new Promise(function(resolve,reject){
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    /**
     * @method query
     * @param {Object} query
     * @param {Array.<Boolean>} query.bound if bound is defined, startAt and stopAt must be defined
     * @param {String} query.indexName
     * @param {*} query.eq only
     * @param {*} query.gt lowerBound
     * @param {*} query.gte lowerBound with true
     * @param {*} query.lt upperBound
     * @param {*} query.lte upperBound with true
     * @param {Object|Function} query.filter
     * @param {String|Number} query.startAt if bound is an array, startAt and stopAt must be defined
     * @param {String|Number} query.stopAt
     * @param {String} [query.order] prev,prevunique,next,nextunique
     * @param storeName
     * @param {Object} [opt]
     * @param {String} [opt.openMode='readonly'] readwrite or readonly
     * @param {Function} [opt.onCursor]
     * @param {Boolean} [opt.openKeyCursor]
     * @param {function(Error,Object)} callback
     */
    query(query, storeName, opt, callback) {
        opt = opt || {};
        opt.openMode = opt.openMode || 'readonly';
        query = query || {};
        query.order = query.order || 'next';
        storeName = storeName || this.config.currentStore;
        var trans = this.openTransaction(storeName, opt.openMode),
            itemStore = trans.objectStore(storeName),
            self = this,
            index, range = null, collect = [], reqStore, req;
        if (query.indexName) {
            index = itemStore.index(query.indexName);
        }

        if (Array.isArray(query.bound)) {
            range = IDBKeyRange.bound(query.startAt, query.stopAt, query.bound[0], query.bound[1]);
        } else {
            if ('eq' in query) {
                range = IDBKeyRange.only(query.eq);
            } else if ('gt' in query) {
                range = IDBKeyRange.lowerBound(query.gt);
            } else if ('gte' in query) {
                range = IDBKeyRange.lowerBound(query.gte, true);
            } else if ('lt' in query) {
                range = IDBKeyRange.upperBound(query.lt);

            } else if ('lte' in query) {
                range = IDBKeyRange.upperBound(query.lte, true);
            }
        }
        reqStore = index || itemStore;
        if (opt.openKeyCursor) {
            req = reqStore.openKeyCursor(range, query.order);
        } else {
            req = reqStore.openCursor(range, query.order);
        }
        req.onsuccess = function (event) {
            var queryCursor = event.target.result;
            if (queryCursor) {
                // Do something with the matches.
                //console.log('queryCursor looping');
                opt.onCursor && opt.onCursor(queryCursor);
                if (opt.openMode === 'readonly') {
                    if (!query.filter) {
                        collect.push(queryCursor.value);
                    } else {
                        if (self.queryFilter(query.filter, queryCursor)) {
                            collect.push(queryCursor.value);
                        }
                    }
                }
                queryCursor['continue']();
            } else {
                callback && callback(null, {
                    data: collect
                });
            }
        };

        req.onerror = function (evt) {
            console.warn(evt.target.error.message, evt.target.error.name);
            if (evt.target.error.name === 'AbortError') {
                return;
            }
            callback && callback({
                error: evt.target.error,
                type: evt.target.error.name
            });
        };
        return {
            abort: function () {
                console.log('called abort');
                req.readyState !== 'done' && trans.abort();
            }
        };
    }

    queryFilter(filter, cursor) {
        if (typeof(filter) === 'function') {
            return filter(cursor);
        }
        var value = cursor.value;
        return new Function('$record', 'return ' + filter.join(' && ') + ' ;')(value);
    }

    dropDB() {
        this.db.close();
        return this.indexedDB().deleteDatabase(this.config.dbName);
    }

}
