import IndexedDBWrapper from '../lib/IndexedDBWrapper';
import IDBStore from '../lib/IDBStore';
describe('indexedDBWrapper', function () {
    var exampleStru = {
        "schema": [{
            "version": 1,
            "schema": {
                "users": {
                    "keyPath": {
                        "keyPath": "id",
                        "autoIncrement": true
                    },
                    "indexes": {
                        "username": {
                            "index": "username",
                            "unique": true
                        },
                        "username_mail": {
                            "index": ["username", "email"],
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
    var idb, testDB, users;
    indexedDB.deleteDatabase('test');
    beforeEach(function () {
        //originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
    });
    it('should create database', function (done) {
        idb = new IndexedDBWrapper();
        idb.open({
            dbName: 'test',
            version: 1,
            schema: exampleStru.schema
        }).then(function (db) {
            expect(db).toBeDefined();
            testDB = db;
            done();
        }, function (err) {
            expect(err).toBeNull();
            done();
        });
    });
    it('should get store helper', function () {
        users = idb.store('users');
        expect(users instanceof IDBStore).toBeTruthy();
    });
    it('should import data', function (done) {
        users.bulk({
            "put": [{
                username: "admin",
                "email": "contact@sesamtv.com"
            }, {
                username: "hlu",
                email: "hlu@sesamtv.com"
            }]
        }).then(function (res) {
            console.log(res);
            done();
        }, function (err) {
            console.error(err);
            expect(err).toBeNull();
            done();
        });
    });
    it('should replace data', function (done) {
        users.upsert('admin', {
            username: "admin1",
            tel: "0642345234"
        }, 'username').then(function (res) {
            done();
        }, function (err) {
            console.error(err);
            expect(err).toBeNull();
            done();
        });
    });
    it('should merge data', function (done) {
        users.upsert('admin1', {
            username: "admin",
            email: "contact@sesamtv.com",
            tel: "0642345234"
        }, 'username', true).then(function (res) {
            done();
        }, function (err) {
            console.error(err);
            expect(err).toBeNull();
            done();
        });
    });

});