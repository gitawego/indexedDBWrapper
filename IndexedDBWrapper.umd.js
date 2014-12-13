import IndexedDBWrapper from './lib/IndexedDBWrapper';

if (typeof define === 'function' && define['amd']) {
    define(function() { return IndexedDBWrapper; });
} else if (typeof module !== 'undefined' && module['exports']) {
    module['exports'] = IndexedDBWrapper;
} else if (typeof this !== 'undefined') {
    this['IndexedDBWrapper'] = IndexedDBWrapper;
}