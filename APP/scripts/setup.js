'use strict';
const db = require('@arangodb').db;

function createCollection(name) {
    var collectionName = db._collectionName(name);
    if (!db._collection(collectionName)) {
        db._create(collectionName);
    } else if (module.context.isProduction) {
        console.warn("collection '%s' already exists. Leaving it untouched.", collectionName);
    }
}

// createCollection("");