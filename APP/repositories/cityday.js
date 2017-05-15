'use strict';
const db = require('@arangodb').db;
const getArrayDiff = require('../utils').getArrayDiff;
const removeCollectionFromKey = require('../utils').removeCollectionFromKey;
const addToEdge = require('../utils').addToEdge;
const Trips = require('../repositories/trips');

// module.exports = Foxx.Repository.extend({
// 	addPreSelection,
// 	deletePreSelection,
// 	getTours,
// 	patchTours
// });

const _serviceBookings = require('./servicebookings');
const _tours = require('./tours');

const _cityDays = db._collection('cityDays');
module.exports = _cityDays;

_cityDays.addPreSelection = addPreSelection;
function addPreSelection(fromId, toId, startSlot) {
	let aqlQuery = `
		UPSERT {'_from':@from, '_to':@to, 'startSlot':@startSlot}
		INSERT {'_from':@from, '_to':@to, 'startSlot':@startSlot}
		UPDATE {}
		IN preselect
		RETURN NEW`;
	return db._query(aqlQuery, {'from': fromId, 'to': toId, 'startSlot': startSlot}).toArray();
}

_cityDays.deletePreSelection = deletePreSelection;
function deletePreSelection(fromId, toId, startSlot) {
	let aqlQuery = `
		FOR preselection IN preselect
			FILTER
				preselection._from == @from &&
				preselection._to == @to &&
				preselection.startSlot == @startSlot
				REMOVE preselection IN preselect`;
	return db._query(aqlQuery, {'from': fromId, 'to': toId, 'startSlot': startSlot}).toArray();
}

function getServiceBookings(cityDayKey) {
	const _cityDayKey = removeCollectionFromKey(cityDayKey);
	let result = {};
	let cityDay = db.cityDays.document(_cityDayKey);
	if (cityDay) {
		result = cityDay;
		let services = db.bookIn.outEdges('cityDays/' + _cityDayKey);
		let serviceBookings = [];
		for (let i = 0; i < services.length; i++) {
			let serviceBookingKey = services[i]._to;
			let serviceBooking = _serviceBookings.getServiceBooking(serviceBookingKey);
			if (serviceBooking) {
				serviceBookings.push(serviceBooking);
			}
		}
		result.serviceBookings = serviceBookings;
	}
	return result;
}

function getDefaultPickUpAndDropOffTimes(startSlot, durationSlots) {
	let result = {};
	switch (startSlot) {
		case 1: {
			result.pickUp = {time: '0700', location: 'Hotel lobby'};
			switch (durationSlots) {
				case 1: {
					result.dropOff = {time: '1300', location: 'Hotel lobby'};
					break;
				}
				case 2: {
					result.dropOff = {time: '1700', location: 'Hotel lobby'};
					break;
				}
				case 3: {
					result.dropOff = {time: '2300', location: 'Hotel lobby'};
					break;
				}
				default: {
					break;
				}
			}
			break;
		}
		case 2: {
			result.pickUp = {time: '1100', location: 'Hotel lobby'};
			switch (durationSlots) {
				case 1: {
					result.dropOff = {time: '1700', location: 'Hotel lobby'};
					break;
				}
				case 2: {
					result.dropOff = {time: '2300', location: 'Hotel lobby'};
					break;
				}
				default: {
					break;
				}
			}
			break;
		}
		case 3: {
			result.pickUp = {time: '1700', location: 'Hotel lobby'};
			result.dropOff = {time: '2300', location: 'Hotel lobby'};
			break;
		}
		default: {
			break;
		}
	}
	return result;
}

function saveTours(serviceBookingDetails, tourKeys, cityDayKey) {
	for (let i = 0; i < tourKeys.length; i++) {
		let tour = _tours.getTour('tours/' + tourKeys[i].tourKey);
		let pickUpAndDropOff = getDefaultPickUpAndDropOffTimes(tourKeys[i].startSlot, tour[0].durationSlots);
		const _serviceBookingDetails = {startSlot: tourKeys[i].startSlot, durationSlots: tour[0].durationSlots, pickUp: pickUpAndDropOff.pickUp, dropOff: pickUpAndDropOff.dropOff, serviceBookingType: 'tour'};
		let serviceBooking = db.serviceBookings.save(_serviceBookingDetails);
		if (serviceBooking) {
			addToEdge('cityDays', cityDayKey, 'serviceBookings', serviceBooking._key, 'bookIn', {label: 'BookIn'});
			addToEdge('serviceBookings', serviceBooking._key, 'tours', tourKeys[i].tourKey, 'use', {label: 'Use'});
		}
	}
}

function savePlaceholders(newPlaceholders, cityDayKey) {
	for (let i=0; i<newPlaceholders.length; i++) {
		if (newPlaceholders[i].type === 'customTour') {
			newPlaceholders[i].cancelHours = 168;
		}
		let pickUpAndDropOff = getDefaultPickUpAndDropOffTimes(newPlaceholders[i].startSlot, newPlaceholders.durationSlots);
		newPlaceholders[i].pickUp = pickUpAndDropOff.pickUp;
		newPlaceholders[i].dropOff = pickUpAndDropOff.dropOff;
	}
	let aqlQuery = `
		LET cityDayId = CONCAT('cityDays/', @cityDayKey)
		LET newPlaceholders = (
			FOR placeholder IN @placeholders
					INSERT { placeholder: {title: placeholder.title, type: placeholder.type}, startSlot: placeholder.startSlot,
					durationSlots: placeholder.durationSlots, notes: placeholder.notes, cancelHours: placeholder.cancelHours,
					pickUp: placeholder.pickUp, dropOff: placeholder.dropOff} IN serviceBookings
			RETURN NEW)
			FOR serviceBooking IN newPlaceholders
					INSERT {_from:cityDayId, _to:serviceBooking._id, label: 'placeholder'} IN bookIn
					RETURN NEW`;
	return db._query(aqlQuery, {'cityDayKey': cityDayKey, 'placeholders': newPlaceholders}).toArray();
}

function deletePlaceholders(newPlaceholders, cityDayKey) {
	let aqlQuery = `
		LET cityDayId = CONCAT('cityDays/', @cityDayKey)
		LET oldPlaceholders = (
			FOR placeholder IN @placeholders
					LET placeholderId = CONCAT('serviceBookings/', placeholder.serviceBookingKey)
					FOR placeholderServicebooking IN serviceBookings
							FILTER placeholderServicebooking._id == placeholderId
							REMOVE placeholderServicebooking IN serviceBookings
							RETURN OLD
					)
					FOR toRemoveEdges IN oldPlaceholders
					FOR edge IN bookIn
							FILTER edge._to == toRemoveEdges._id
							REMOVE edge IN bookIn
					RETURN OLD`;
	return db._query(aqlQuery, {'cityDayKey': cityDayKey, 'placeholders': newPlaceholders}).toArray();
}

function deleteTours(serviceBookingKeys) {
	for (let i=0; i<serviceBookingKeys.length; i++) {
		let aqlQuery =
			`FOR edge IN use
				FILTER edge._from == '${serviceBookingKeys[i]}'
			REMOVE edge IN use`;
		db._query(aqlQuery);
		aqlQuery =
			`FOR edge IN bookIn
				FILTER edge._to == '${serviceBookingKeys[i]}'
			REMOVE edge IN bookIn`;
		db._query(aqlQuery);
		let stripedKey = removeCollectionFromKey(serviceBookingKeys[i]);
		_serviceBookings.remove(stripedKey);
	}
}

function getDeleteServiceBookingKeys(cityDayKey, tourKeys) {
	let aqlQuery = `
		LET cityDayId = CONCAT('cityDays/', @cityDayKey)
		LET services = (FOR vertex, edge IN OUTBOUND cityDayId bookIn RETURN edge)
		FOR service IN services
			LET tourEdges = (FOR vertex, edge IN OUTBOUND service._to use RETURN edge)
			FOR tours IN tourEdges
			FOR tour IN @tourKeys
					LET tourId = CONCAT('tours/',tour.tourKey)
					FILTER tourId == tours._to
			FOR serviceBooking IN serviceBookings
					FILTER (serviceBooking._id == service._to) && (tour.startSlot == serviceBooking.startSlot)
					RETURN service._to`;
	return db._query(aqlQuery, {'cityDayKey': cityDayKey, 'tourKeys': tourKeys}).toArray();
}

_cityDays.getTours = getTours;
function getTours(cityDayKey) {
	let aqlQuery = `
		LET services = (FOR vertex, edge IN OUTBOUND CONCAT('cityDays/', @cityDayKey) bookIn RETURN edge)
		FOR service IN services
			LET tourEdges = (FOR vertex, edge IN OUTBOUND service._to use RETURN edge)
			FOR tourEdge IN tourEdges
				FOR tour in tours
				FILTER tour._id == tourEdge._to
					FOR serviceBooking IN serviceBookings
						FILTER serviceBooking._id == service._to
					RETURN {tourKey: tour._key, startSlot: serviceBooking.startSlot}`;
	return db._query(aqlQuery, {'cityDayKey': cityDayKey}).toArray();
}

function getPlaceholders(cityDayKey) {
	let aqlQuery = `
		LET services = (FOR vertex, edge IN OUTBOUND CONCAT('cityDays/', @cityDayKey) bookIn RETURN edge)
		FOR service IN services
			FILTER service.label == 'placeholder'
			FOR serviceBooking IN serviceBookings
					FILTER serviceBooking._id == service._to
			RETURN {serviceBookingKey: serviceBooking._key}`;
	return db._query(aqlQuery, {'cityDayKey': cityDayKey}).toArray();
}

function getKeyArray(newPlaceholders) {
	let result = [];
	for (let i=0; i<newPlaceholders.length; i++) {
		if (newPlaceholders[i].serviceBookingKey) {
			result.push({serviceBookingKey: newPlaceholders[i].serviceBookingKey});
		}
	}
	return result;
}

function getNewPlaceholdersObjects(newPlaceholders) {
	let result = [];
	for (let i=0; i<newPlaceholders.length; i++) {
		if (newPlaceholders[i].title) {
			result.push(newPlaceholders[i]);
		}
	}
	return result;
}

_cityDays.patchTours = patchTours;
function patchTours(cityDayKey, newTours, newPlaceholders) {
	let previousTours = getTours(cityDayKey);
	let toDeleteTours = getArrayDiff(newTours, previousTours);
	let toCreateTours = getArrayDiff(previousTours, newTours);
	let toDeleteServiceBookingKeys = getDeleteServiceBookingKeys(cityDayKey, toDeleteTours);
	deleteTours(toDeleteServiceBookingKeys);
	saveTours({}, toCreateTours, cityDayKey);
	let newPlaceholderKeys = getKeyArray(newPlaceholders);
	let previousPlaceholders = getPlaceholders(cityDayKey);
	let toDeletePlaceholders = getArrayDiff(newPlaceholderKeys, previousPlaceholders);
	deletePlaceholders(toDeletePlaceholders, cityDayKey);
	let newPlaceholdersObjects = getNewPlaceholdersObjects(newPlaceholders);
	savePlaceholders(newPlaceholdersObjects, cityDayKey);
	return getServiceBookings(cityDayKey);
}

// TEMP
_cityDays.TEMP_addDateToCityDays = TEMP_addDateToCityDays;
function TEMP_addDateToCityDays(cityDays) {
	let resultList = [];
	cityDays.forEach((cityDay) => {
		let aqlQuery = `
			LET cityDayId = CONCAT('cityDays/', @cityDayKey)
			FOR trip IN 3..3 INBOUND cityDayId GRAPH 'exo-dev'
    		FILTER IS_SAME_COLLECTION('trips', trip)
			RETURN trip._key`;
		let tripKey = db._query(aqlQuery, {'cityDayKey': cityDay._key}).next();
		Trips.updateStartDayAndDuration(tripKey);
		resultList.push(db._document(cityDay._id));
	});
	return resultList;
}

_cityDays.TEMP_addDateToCityDay = TEMP_addDateToCityDay;
function TEMP_addDateToCityDay(cityDay) {
	let res = TEMP_addDateToCityDays([cityDay]);
	let result;
	if (res.length > 0) {
		result = res[0];
	} else {
		result = cityDay;
	}
	return result;
}
// END TEMP
