'use strict';
const db = require("@arangodb").db;

const _proposals = db._collection('proposals');
module.exports = _proposals;

//TODO: Make sure main pax is set.
_proposals.getLeadPaxName = getLeadPaxName;
function getLeadPaxName(proposalKey) {
	let aqlQuery = `
  LET proposalId = CONCAT('proposals/', @proposalKey)
	FOR vertex, edges IN 1..1 OUTBOUND proposalId GRAPH 'exo-dev'
    FILTER IS_SAME_COLLECTION('paxs', vertex) && edges.mainPax
    LET paxtype = SUBSTITUTE(vertex.ageGroup, ['adults', 'children', 'infants'], ['A', 'C', 'I'])
    RETURN CONCAT(vertex.firstName, ' ', vertex.lastName)`;
	return db._query(aqlQuery, {proposalKey}).next();
}