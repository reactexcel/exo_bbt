'use strict';
const db = require("@arangodb").db;

const _tours = db._collection('tours');
module.exports = _tours;

// module.exports = Foxx.Repository.extend({
// 	addTour,
// 	clearTours,
// 	allTours,
// 	getTour
// });

_tours.addTour = addTour;
function addTour(tour) {
	_tours.save(tour);
}

_tours.clearTours = clearTours;
function clearTours() {
	_tours.truncate();
}

_tours.allTours = allTours;
function allTours() {
	var aqlQuery = `FOR tour in @@collection
    RETURN tour`;
	var result = db._query(aqlQuery, {'@collection': 'tours'}).toArray();
	if (result) {
		return result;
	} else {
		return null
	}
}

_tours.getTour = getTour;
function getTour(tourKey) {
	var aqlQuery = `
	FOR tour IN tours
		FILTER tour._id == @tourKey
		RETURN tour`;
	return db._query(aqlQuery, {'tourKey': tourKey}).toArray();
}