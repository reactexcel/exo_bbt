'use strict';
const db = require('@arangodb').db;

function dropCollection(name) {
    var collectionName = db._collectionName(name);
    db._drop(collectionName);
}

// dropCollection("");