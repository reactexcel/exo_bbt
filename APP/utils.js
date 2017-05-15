'use strict';
const db = require("@arangodb").db;
const joi = require('joi');

const tourAgentIDSchema = joi.string().required()
	.description('The agent ID of the tour')
	.meta({allowMultiple: false});
const tourAgentPasswordSchema = joi.string().required()
	.description('The agent password of the tour')
	.meta({allowMultiple: false});
const tourcountrySchema = joi.string().required()
	.description('The country of the tour')
	.meta({allowMultiple: false});
const tourcitySchema = joi.string().required()
	.description('The city of the tour')
	.meta({allowMultiple: false});
const tourdateSchema = joi.string().required()
	.description('The date of the tour')
	.meta({allowMultiple: false});
const tourOptionNumberSchema = joi.string().required()
	.description('The option number of the tour')
	.meta({allowMultiple: false});
const tourNrOfAdultsSchema = joi.string().required()
	.description('The number of adults joining the tour')
	.meta({allowMultiple: false});
const tourNrOfChildrenSchema = joi.string().required()
	.description('The number of adults joining the tour')
	.meta({allowMultiple: false});
const tourNrOfInfantsSchema = joi.string().required()
	.description('The number of adults joining the tour')
	.meta({allowMultiple: false});
const countryBookingIdSchema = joi.string().required()
	.description('The Id of the country booking')
	.meta({allowMultiple: false});

const tours = db._collection('tours');
const cities = db._collection('cities');
const serviceBookings = db._collection('serviceBookings');
const bookIn = db._collection('bookIn');
const suppliers = db._collection('suppliers');
const trips = db._collection('trips');
const proposals = db._collection('proposals');
const supply = db._collection('supply');
const accommodations = db._collection('accommodations');
const transfers = db._collection('transfers');
const locations = db._collection('locations');
const locatedIn = db._collection('locatedIn');

function cleanUpString(textStr) {
	// details: substitute(substitute(substitute(substitute(cms.hotels_about_text, '\n', ''), '\t', ''), '<p>', ''), '</p>', ''),
	let result = textStr;
	if (textStr) {
		result = textStr.replace(/&amp|\n|<p>|<\/p>|\t/gi, '');
	}
	return result;
}

function upsertDocument(document, collection) {
	let doc = JSON.stringify(document);
	let aqlQuery = `
		UPSERT ${doc}
		INSERT ${doc}
		UPDATE { }
		IN ${collection}`;
	let result = db._query(aqlQuery).toArray();
	return result.length;
}

function addTour(tour) {
	upsertDocument(tour, 'tours');
}

function addCity(city) {
	upsertDocument(city, 'cities');
}

function addTransfer(transfer) {
	console.log(JSON.stringify(transfer));
	//const doc = JSON.stringify(transfer);
	const aqlUpdate = `
		let dateStamp = DATE_FORMAT(DATE_NOW(), "%yyyy-%mm-%dd")
			upsert {"productOptCode": @doc.productOptCode}
			insert @doc
			update merge(@doc, {"lastUpdated": dateStamp})
			in transfers`;
	db._query(aqlUpdate, { doc: transfer });
}

function addDateStamp(collection) {
	const aqlUpdate = `
	let dateStamp = DATE_FORMAT(DATE_NOW(), "%yyyy-%mm-%dd")
	for doc in @@collection
    update doc with MERGE(doc, {lastUpdated: dateStamp}) in @@collection`;
	db._query(aqlUpdate, { "@collection": collection });
}

function addLocation(location) {
	upsertDocument(location, 'locations');
}

function addBooking(serviceBooking, tour, countryBooking, trip, PAXlist) {
	let e1 = db.use.insert(serviceBooking, tour, {});
	let e2 = db.bookIn.insert(countryBooking, serviceBooking, {});

	for (let i = 0; i < PAXlist.length; i++) {
		let PAX = PAXlist[i];
		let e3 = db.participateIn.insert(PAX, countryBooking, {});
	}
	let e4 = db.bookIn.insert(trip, countryBooking, {});
}

function addSupplier(supplier) {
	return upsertDocument(supplier, 'suppliers');
}

function addCountryBooking(from, to, params) {
	let trip = db.trips.document(from);
	let countrybooking = db.countryBookings.document(to);
	db.bookIn.insert(trip, countrybooking, params);
}

function addCityBooking(from, to, params) {
	let countrybooking = db.countryBookings.document(from);
	let citybooking = db.cityBookings.document(to);
	db.bookIn.insert(countrybooking, citybooking, params);
}

function addServiceBooking(from, to, params) {
	let servicebooking = db.serviceBookings.document(from);
	let tour = db.tours.document(to);
	db.use.insert(servicebooking, tour, params);
}

function addCityPreselect(from, to, params) {
	let tour = db.tours.document(to);
	let citybooking = db.cityBookings.document(from);
	db.preselect.insert(citybooking, tour, params);
}

function addServicePreselect(from, to, params) {
	let tour = db.tours.document(to);
	let service = db.serviceBookings.document(from);
	db.preselect.insert(service, tour, params);
}

function addProposal(from, to, params) {
	let proposal = proposals.document(from);
	let trip = trips.document(to);
	console.log(`proposal: ${proposal} trip: ${trip} params: ${params}`);
	db.bookIn.insert(proposal, trip, params);
}

function addCountryBookingKeyToTrip(tripKey, countryBookingKey) {
	let trip = db.trips.document(tripKey);
	let countryOrder = trip.countryOrder;
	if (countryOrder) {
		countryOrder.push(countryBookingKey);
	} else {
		countryOrder = [countryBookingKey];
	}
	trip.countryOrder = countryOrder;
	return trip;
}

function addToEdge(fromCollection, fromKey, toCollection, toKey, edgeCollection, params = {}) {
	let from = db._collection(fromCollection).document(fromKey);
	let to = db._collection(toCollection).document(toKey);
	let key = db[edgeCollection].insert(from, to, params);
	let result = db._document(key);
	return result;
}

function addAccommodation(accommodation) {
	return upsertDocument(accommodation, 'accommodations');
}

function createEdgeSupply(products) {
	let aqlQuery = `
	FOR supplier IN suppliers
  	FOR product IN ${products}
    	FILTER supplier.supplierId == product.supplierId
    		UPSERT {_from: supplier._id, _to: product._id}
    		INSERT {_from: supplier._id, _to: product._id}
    		UPDATE { }
    		IN supply`;
	let res = db._query(aqlQuery).toArray();
	return res;
}

function clearCities() {
	cities.truncate();
}

function clearTours() {
	tours.truncate();
}

function clearSuppliers() {
	suppliers.truncate();
}

function clearAccommodations() {
	accommodations.truncate();
}

function clearSupplyCollection() {
	supply.truncate();
}

function clearTransfers() {
	transfers.truncate();
}

function clearLocations() {
	locations.truncate();
}

function clearLocatedIn() {
	locatedIn.truncate();
}

function removeCollectionFromKey(key) {
	//TODO: Find a better way to handle the "Document handel". This function gets the key from a document ID. "collection/123456789"
	let result = key;
	let n = result.lastIndexOf('/');
	if (n !== -1) {
		result = result.substr(n + 1);
	}
	return result;
}

function removeEdges(edgeCollection, fromCollection, fromId, label, labelValue) {
	let fromDoc = db._collection(fromCollection).document(fromId);
	let aqlQuery = `
	FOR p IN ${edgeCollection}
		FILTER p.${label} == ${labelValue} && p._from == '${fromDoc._id}'
	REMOVE p IN ${edgeCollection}`;
	return db._query(aqlQuery).toArray();
}

function getTrips(proposalKey) {
	let edge = db.bookIn.outEdges("proposals/" + proposalKey);
	let result = Array();
	for (let i = 0; i < edge.length; i++) {
		result.push(db.trips.document(edge[i]._to));
	}
	return result;
}

/**
 *
 * Get the difference of arrayA and arrayB.
 * Ex.
 * arrayA [
 * {"tourKey":"1", "startSlot": 2},
 * {"tourKey":"2", "startSlot": 2},
 * {"tourKey":"3", "startSlot": 2},
 * {"tourKey":"4", "startSlot": 2},
 * {"tourKey":"5", "startSlot": 2}],
 * arrayB [
 * {"tourKey":"3", "startSlot":2},
 * {"tourKey":"4", "startSlot":2}] =>
 *
 * [
 * {"tourKey":"1", "startSlot": 2},
 * {"tourKey":"2", "startSlot": 2},
 * {"tourKey":"5", "startSlot": 2}]
 *
 * Ex. arrayA [
 * {"tourKey":"3", "startSlot": 2},
 * {"tourKey":"4", "startSlot": 2}],
 * arrayB [
 * {"tourKey":"1", "startSlot": 2},
 * {"tourKey":"2", "startSlot": 2},
 * {"tourKey":"4", "startSlot": 2},
 * {"tourKey":"5", "startSlot": 2},
 * {"tourKey":"6", "startSlot": 2}] =>
 *
 * [
 * {"tourKey":"1", "startSlot": 2},
 * {"tourKey":"2", "startSlot": 2},
 * {"tourKey":"5", "startSlot": 2},
 * {"tourKey":"6", "startSlot": 2}]
 *
 **/
function getArrayDiff(arrayA, arrayB) {
	let result = [];
	for (let i=0; i<arrayB.length; i++) {
		let found = false;
		for (let j=0; j<arrayA.length; j++) {
			found = (JSON.stringify(arrayB[i]) === JSON.stringify(arrayA[j]));
			if (found) { break; }
		}
		if (!found) {
			result.push(arrayB[i]);
		}
	}
	return result;
}

module.exports = {
	cleanUpString: cleanUpString,
	upsertDocument: upsertDocument,
	tourAgentIDSchema: tourAgentIDSchema,
	tourAgentPasswordSchema: tourAgentPasswordSchema,
	tourcountrySchema: tourcountrySchema,
	tourcitySchema: tourcitySchema,
	tourdateSchema: tourdateSchema,
	tourOptionNumberSchema: tourOptionNumberSchema,
	tourNrOfAdultsSchema: tourNrOfAdultsSchema,
	tourNrOfChildrenSchema: tourNrOfChildrenSchema,
	tourNrOfInfantsSchema: tourNrOfInfantsSchema,
	countryBookingIdSchema: countryBookingIdSchema,
	addTour: addTour,
	addCity: addCity,
	addTransfer: addTransfer,
	addDateStamp: addDateStamp,
	addLocation: addLocation,
	addBooking: addBooking,
	addSupplier: addSupplier,
	addCountryBooking: addCountryBooking,
	addCityBooking: addCityBooking,
	addServiceBooking: addServiceBooking,
	addCityPreselect: addCityPreselect,
	addServicePreselect: addServicePreselect,
	addProposal: addProposal,
	addCountryBookingKeyToTrip: addCountryBookingKeyToTrip,
	addToEdge: addToEdge,
	addAccommodation: addAccommodation,
	createEdgeSupply: createEdgeSupply,
	clearCities: clearCities,
	clearTours: clearTours,
	clearSuppliers: clearSuppliers,
	clearAccommodations: clearAccommodations,
	clearSupplyCollection: clearSupplyCollection,
	clearTransfers: clearTransfers,
	clearLocations: clearLocations,
	clearLocatedIn: clearLocatedIn,
	removeCollectionFromKey: removeCollectionFromKey,
	removeEdges: removeEdges,
	getTrips: getTrips,
	getArrayDiff: getArrayDiff
};
