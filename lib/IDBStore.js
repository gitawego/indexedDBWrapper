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

    insert(item) {
        var itemStore = this.db.getStore(this.storeName, 'readwrite'),
            req = itemStore.add(item);
        return new Promise(function (resolve, reject) {
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    openTransaction(mode) {
        return this.db.openTransaction(this.storeName, mode);
    }

    upsert(query, data, merge) {
        var tasks = [], hasData;
        return new Promise((resolve, reject) => {
            this.query(query, {
                openMode: 'readwrite',
                onCursor: (cursor, store, objectStore) => {
                    hasData = true;
                    if (merge) {
                        data = helper.mixin(cursor.value, data);
                    }
                    data[objectStore.keyPath] = cursor.primaryKey;
                    tasks.push(this.cursorOperation(cursor, 'update', data));
                }
            }).then((res)=> {
                if (!hasData) {
                    var objectStore = this.db.getStore(this.storeName, 'readwrite');
                    tasks.push(new Promise(function (resolve, reject) {
                        var req = objectStore.add(data);
                        req.onsuccess = resolve;
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

    bulk(items) {
        return this.db.bulk(items, this.storeName);
    }

    removeByKey(keyPathId) {
        var itemStore = this.db.getStore(this.storeName, 'readwrite'),
            req = itemStore['delete'](keyPathId);
        return new Promise(function (resolve, reject) {
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    remove(query) {
        var tasks = [];
        return new Promise((resolve, reject) => {
            this.query(query, {
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

    findByKey(keyValue) {
        var req = this.db.getStore(this.storeName, 'readwrite').get(keyValue);
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

    findOne(query) {
        return new Promise((resolve,reject) => {
            this.query(query, {
                onCursor: function () {
                    return false;
                }
            }).then(function(res){
                resolve(res[0]);
            },reject);
        });
    }

    find(query) {
        return this.query(query);
    }

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
        var trans = this.openTransaction(opt.openMode),
            objectStore = trans.objectStore(this.storeName), reqStore,
            self = this, collect = [], req, range;
        range = this.buildRange(query);
        reqStore = objectStore;
        if (range) {
            if (query.index && objectStore.indexNames.contains(query.index)) {
                reqStore = objectStore.index(query.index);
                req = reqStore.openCursor(range, query.order);
            } else {
                req = reqStore.openCursor(range, query.order);
            }
        } else {
            req = reqStore.openCursor();
        }

        var deferred = new Promise((resolve, reject)=> {
            req.onsuccess = function (event) {
                var queryCursor = event.target.result, next = true;
                if (queryCursor) {
                    if(query.filter){
                        if (!self.queryFilter(query.filter, queryCursor)) {
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
