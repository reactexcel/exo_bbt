'use strict';
const db = require("@arangodb").db;

const paxs = db._collection('paxs');
module.exports = paxs;

/**
 * Get Paxs by proposalKey or tripKey
 * @param collection - proposal or trip
 * @param key - proposalKey or tripKey
 */
paxs.getPaxsByKey = getPaxsByKey;
function getPaxsByKey(collection, key) {
  const paxIds = db.participate.byExample({ _from: `${collection}/${key}` }).toArray().map(edge => edge._to);
  return db.paxs.document(paxIds);
}
