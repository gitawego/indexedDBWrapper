export default
class IDBStore {
    constructor(db, storeName) {
        this.db = db;
        this.storeName = storeName;
    }

    clear() {
        var store = this.db.getStore(this.storeName, 'readwrite');
        return new Promise(function (resolve, reject) {
            var req = store.clear();
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    drop() {
        return new Promise((resolve, reject)=> {
            var itemStore = this.db.getStore(this.storeName, 'readwrite'),
                req = itemStore['delete']();
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    add(item, isPut) {
        var itemStore = this.db.getStore(this.storeName, 'readwrite'),
            req = itemStore[isPut ? 'put' : 'add'](item);
        return new Promise(function (resolve, reject) {
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    openTransaction(mode) {
        return this.db.openTransaction(this.storeName, mode);
    }

    upsert(query, data, merge) {
        var self = this, tasks = [];
        return new Promise((resolve, reject) => {
            self.query(query, {
                openMode: 'readwrite',
                onCursor: (cursor, store) => {
                    if (!cursor) {
                        tasks.push(new Promise(function (resolve, reject) {
                            var req = store.add(data);
                            req.onsuccess = resolve;
                            req.onerror = reject;
                        }));
                    } else {
                        if (merge) {
                            data = helper.mixin(cursor.value, data);
                        }
                        tasks.push(this.cursorOperation(cursor, 'update', data));
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

    /**
     *
     * @param data
     * @param {*} query if it's an array, indexName must be defined, and it's must be a compound key
     * @param {Object} data
     * @param {String} [indexName] index name if indexName not defined, query is based on keyPath
     * @param {Boolean} [merge] if not merge, original data will be replaced by the new data
     */
    _upsert(query, data, indexName, merge) {
        return new Promise((resolve, reject) => {
            var store = this.db.getStore(this.storeName, 'readwrite'),
                req;
            if (!indexName) {
                req = store.get(query);
            } else {
                req = store.index(indexName).get(query);
            }
            req.onsuccess = function () {
                var res = this.result, r;
                if (res) {
                    if (merge) {
                        data = helper.mixin(res, data);
                    } else {
                        data[store.keyPath] = res[store.keyPath];
                    }
                    r = store.put(data);
                } else {
                    r = store.add(data);
                }
                r.onsuccess = function () {
                    resolve(data);
                };
                r.onerror = reject;
            };
            req.onerror = reject;
        });
    }

    bulk(items) {
        return this.db.bulk(items, this.storeName);
    }

    removeByKeyPath(keyPathId) {
        var itemStore = this.db.getStore(this.storeName, 'readwrite'),
            req = itemStore['delete'](keyPathId);
        return new Promise(function (resolve, reject) {
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    remove(query) {
        var self = this, tasks = [];
        return new Promise((resolve, reject) => {
            self.query(query, {
                openMode: 'readwrite',
                onCursor: (cursor) => {
                    if (cursor) {
                        tasks.push(this.cursorOperation(cursor, 'delete'));
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

    cursorOperation(cursor, action, data) {
        return new Promise(function (resolve, reject) {
            var req;
            if (action !== 'delete') {
                req = cursor[action](data);
            } else {
                req = cursor[action]();
            }
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    byKeyPath(keyPathId) {
        var req = this.db.getStore(this.storeName, 'readwrite').get(keyPathId);
        return new Promise(function (resolve, reject) {
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    buildRange(query) {
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

    /**
     *
     *  query({
     *      "username":{
     *          "eq":"admin"
     *      },
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
     * @param {Object|Function} query.filter
     * @param {String} [query.order] prev,prevunique,next,nextunique
     * @param {Object} [opt]
     * @param {String} [opt.openMode='readonly'] readwrite or readonly
     * @param {Function} [opt.onCursor]
     */
    query(query, opt) {
        opt = opt || {};
        opt.openMode = opt.openMode || 'readonly';
        query = query || {};
        query.order = query.order || 'next';
        var trans = this.openTransaction(this.storeName, opt.openMode),
            reqStore = trans.objectStore(this.storeName),
            self = this, collect = [], req,range;
        var queryKey = Object.keys(query)[0];
        if(queryKey){
            range = this.buildRange(query[queryKey]);
            if(reqStore.indexNames.contains(queryKey)){
                reqStore = reqStore.index(queryKey);
                req = reqStore.openKeyCursor(range, query.order);
            }else{
                req = reqStore.openCursor(range, query.order);
            }
        }else{
            req = reqStore.openCursor();
        }

        if (query.indexName) {
            reqStore = reqStore.index(query.indexName);
            req = reqStore.openKeyCursor(range, query.order);
        } else {
            req = reqStore.openCursor(range, query.order);
        }

        var deferred = new Promise((resolve, reject)=> {
            req.onsuccess = function (event) {
                var queryCursor = event.target.result, next = true;
                if (opt.onCursor) {
                    next = opt.onCursor(queryCursor, reqStore) !== false;
                }
                if (queryCursor) {
                    // Do something with the matches.
                    if (opt.openMode === 'readonly') {
                        if (!query.filter) {
                            collect.push(queryCursor.value);
                        } else {
                            if (self.queryFilter(query.filter, queryCursor)) {
                                collect.push(queryCursor.value);
                            }
                        }
                    }
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
                reject({
                    error: evt.target.error,
                    type: evt.target.error.name
                });
            };
        });
        deferred.abort = function () {
            req.readyState !== 'done' && trans.abort();
        };
        return deferred;
    }

    queryFilter(filter, cursor) {
        if (typeof(filter) === 'function') {
            return filter(cursor);
        }
        var value = cursor.value;
        return new Function('$record', 'return ' + filter.join(' && ') + ' ;')(value);
    }
}