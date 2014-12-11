export default class IDBStore {
    constructor(db,storeName){
        this.db = db;
        this.storeName = storeName;
    }
    clear() {
        var store = this.getStore(this.storeName, 'readwrite');
        return new Promise(function (resolve, reject) {
            var req = store.clear();
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    drop() {
        return new Promise((resolve, reject)=> {
            var itemStore = this.getStore(this.storeName, 'readwrite'),
                req = itemStore['delete']();
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    add(item, isPut) {
        var itemStore = this.getStore(this.storeName, 'readwrite'),
            req = itemStore[isPut ? 'put' : 'add'](item);
        return new Promise(function (resolve, reject) {
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }
    openTransaction(mode){
        return this.db.openTransaction(this.storeName, mode);
    }
    upsert(data, filterKey) {
        var store = this.openTransaction('readwrite').objectStore(storeName);
    }

    /**
     * @method put
     * @param {Object} query
     * @param {Object|Function} newData
     * @param {String} [storeName]
     * @returns {*}
     */
    put(query, newData) {
        var self = this, error;

        return new Promise(function (resolve, reject) {
            self.query(query, this.storeName, {
                openMode: 'readwrite',
                onCursor: function (cursor) {
                    var item = typeof(newData) === 'function' ? newData(cursor.value) :
                        helper.merge(cursor.value, newData);
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

    removeByKeyPath(keyPathId) {
        var itemStore = this.getStore(this.storeName, 'readwrite'),
            req = itemStore['delete'](keyPathId);
        return new Promise(function (resolve, reject) {
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    remove(query) {
        var self = this, tasks = [];
        return new Promise(function (resolve, reject) {
            self.query(query, this.storeName, {
                openMode: 'readwrite',
                onCursor: function (cursor) {
                    tasks.push(self.removeById(cursor.primaryKey, this.storeName));
                }
            }, function (err) {
                if (err) {
                    return reject(err);
                }
                if (!tasks.length) {
                    return resolve();
                }
                Promise.all(tasks).then(resolve, reject);

            });
        });
    }

    byKeyPath(keyPathId) {
        var req = this.getStore(this.storeName, 'readwrite').get(keyPathId);
        return new Promise(function (resolve, reject) {
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    }

    buildRange(query) {
        var range;
        query = query || {};
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
        return range;
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
     * @param {function(Error,Object)} callback
     */
    query(query, opt, callback) {
        opt = opt || {};
        opt.openMode = opt.openMode || 'readonly';
        query = query || {};
        query.order = query.order || 'next';
        var trans = this.openTransaction(this.storeName, opt.openMode),
            reqStore = trans.objectStore(this.storeName),
            self = this, collect = [], req;
        var range = this.buildRange(query);
        if (query.indexName) {
            reqStore = reqStore.index(query.indexName);
            req = reqStore.openKeyCursor(range, query.order);
        } else {
            req = reqStore.openCursor(range, query.order);
        }

        req.onsuccess = function (event) {
            var queryCursor = event.target.result;
            if (queryCursor) {
                // Do something with the matches.
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
}