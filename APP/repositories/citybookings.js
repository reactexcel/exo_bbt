'use strict';
const db = require('@arangodb').db;
const removeCollectionFromKey = require('../utils').removeCollectionFromKey;
const removeCountryCode = require('../utils/serversAndCountries').removeCountryCode;
const addToEdge = require('../utils').addToEdge;
const getArrayDiff = require('../utils').getArrayDiff;
const _serviceBookings = require('./servicebookings');
const _cityBookings = db._collection('cityBookings');
module.exports = _cityBookings;

/*eslint no-param-reassign: 1*/
/*eslint camelcase: 1*/
/*eslint global-require: 1*/
/*eslint new-cap: 1*/
/*eslint no-else-return: 1*/

function getCBId(cityDayKey) {
	let aqlQuery = `
		RETURN FIRST((FOR vertex, edge IN INBOUND CONCAT('cityDays/', @CityDayKey) bookIn RETURN edge))._from`;
	return db._query(aqlQuery, {'CityDayKey': cityDayKey}).next();
}

function removeCityDayFromCollection(cityDayKey) {
	let aqlQuery = `
		FOR cityday IN cityDays
  		FILTER cityday._key == @CityDayKey
  		REMOVE cityday IN cityDays`;
	return db._query(aqlQuery, {'CityDayKey': cityDayKey}).next();
}

function removeCityDayFromEdge(cityDayKey) {
	let aqlQuery = `
		LET cdKey = CONCAT('cityDays/', @CityDayKey)
		LET edgeKey = FIRST((FOR vertex, edge IN INBOUND cdKey bookIn RETURN edge))._key
		FOR edge IN bookIn
  		FILTER edge._key == edgeKey
  		REMOVE edge IN bookIn`;
	return db._query(aqlQuery, {'CityDayKey': cityDayKey}).next();
}

function removeCityDayFromCityBooking(cityDayKey) {
	let aqlQuery = `
		LET cbKey = FIRST((FOR vertex, edge IN INBOUND CONCAT('cityDays/',@CityDayKey) bookIn RETURN edge))._from
		FOR cb IN cityBookings
			FILTER cb._id == cbKey
		LET newDayOrder = REMOVE_VALUE(cb.dayOrder, @CityDayKey)
		UPDATE cb WITH { dayOrder: newDayOrder} IN cityBookings
		RETURN NEW`;
	return db._query(aqlQuery, {'CityDayKey': cityDayKey}).next();
}

_cityBookings.removeCityDay = removeCityDay;
function removeCityDay(cityDayKey) {
	let cityBookingId = getCBId(cityDayKey);
	removeCityDayFromCityBooking(cityDayKey);
	removeCityDayFromEdge(cityDayKey);
	removeCityDayFromCollection(cityDayKey);
	return getServiceBookings(cityBookingId);
}

_cityBookings.insertCityDay = insertCityDay;
function insertCityDay(cityBookingKey, cityDayKey, dayIndex) {
	const _cityBookingKey = removeCollectionFromKey(cityBookingKey);
	let aqlQuery = `
		FOR cb IN cityBookings
  		FILTER cb._key == @cbKey
  			UPDATE cb WITH
  			{ dayOrder: UNION( UNION( SLICE(cb.dayOrder, 0, @dayIndex), [@newCityDayKey]),
  			SLICE(cb.dayOrder, @dayIndex, LENGTH(cb.dayOrder))) }
    		IN cityBookings
				RETURN NEW`;
	return db._query(aqlQuery, {'cbKey': _cityBookingKey, 'newCityDayKey': cityDayKey, 'dayIndex': dayIndex}).toArray();
}

_cityBookings.getServiceBookings = getServiceBookings;
function getServiceBookings(cityBookingKey) {
	const _cityBookingKey = removeCollectionFromKey(cityBookingKey);
	let aqlQuery = `
		LET cityBookingId = CONCAT('cityBookings/', @cityBookingKey)
		LET cityBooking = DOCUMENT(cityBookingId)
		LET cityBookingDayOrder = NOT_NULL(cityBooking.dayOrder) ? cityBooking.dayOrder : []
		LET cityBookingEdges = (FOR vertex, edge IN OUTBOUND cityBookingId bookIn RETURN edge)
		LET theAccommodationPlacements = (
		FOR cityBookingEdge IN cityBookingEdges
			FOR accommodationPlacement IN accommodationPlacements
				FILTER accommodationPlacement._id == cityBookingEdge._to
				LET supplyEdges = (FOR vertex, edge IN OUTBOUND accommodationPlacement._id use RETURN edge)
				RETURN MERGE(accommodationPlacement, {supplier: FIRST(
					FOR supplyEdge IN supplyEdges
						FOR supplier IN suppliers
							FILTER supplyEdge._to == supplier._id
							RETURN supplier)}, {images: FIRST(
								FOR supplyEdge IN supplyEdges
									FOR supplier IN suppliers
										FILTER supplyEdge._to == supplier._id
										RETURN supplier.images)}, { serviceBookings: (
											LET serviceBookingIds = (FOR vertex, edge IN OUTBOUND cityBookingEdge._to bookIn RETURN edge)
											FOR serviceBookingId IN serviceBookingIds
											FOR serviceBooking IN serviceBookings
												FILTER serviceBooking._id == serviceBookingId._to
												RETURN MERGE(serviceBooking, { accommodation: FIRST(
													LET accommodationIds = (FOR vertex, edge IN OUTBOUND serviceBooking._id use RETURN edge)
													FOR accommodationId IN accommodationIds
													FOR accommodation IN accommodations
														FILTER accommodation._id == accommodationId._to
														RETURN accommodation
												)})
							)})
		)

		RETURN MERGE(cityBooking, {accommodationPlacements: theAccommodationPlacements, cityDays: (

		FOR cityDayKey IN cityBookingDayOrder
			LET cityDayId = CONCAT('cityDays/', cityDayKey)
			LET cityDay = DOCUMENT(cityDayId)

			RETURN MERGE(cityDay,  { serviceBookings: (
				LET serviceBookingIds = (FOR vertex, edge IN OUTBOUND cityDay._id bookIn RETURN edge)
				FOR serviceBookingId IN serviceBookingIds
					FOR serviceBooking IN serviceBookings
						FILTER serviceBooking._id == serviceBookingId._to
						RETURN MERGE(serviceBooking, { tour: FIRST(
							LET tourIds = (FOR vertex, edge IN OUTBOUND serviceBooking._id use RETURN edge)
							FOR tourId IN tourIds
								FOR tour IN tours
									FILTER tour._id == tourId._to
										RETURN tour
						)})
			)})
		)})`;

	return db._query(aqlQuery, {'cityBookingKey': _cityBookingKey}).next();
}

_cityBookings.saveTours = saveTours;
function saveTours(serviceBookingDetails, tourKeys, cityBookingKey) {
	for (let i = 0; i < tourKeys.length; i++) {
		let serviceBooking = db.serviceBookings.save(serviceBookingDetails);
		if (serviceBooking) {
			addToEdge('cityBookings', cityBookingKey, 'serviceBookings', serviceBooking._key, 'bookIn', {label: 'BookIn'});
			addToEdge('serviceBookings', serviceBooking._key, 'tours', tourKeys[i], 'use', {label: 'Use'});
		}
	}
	return getServiceBookings(cityBookingKey);
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

function getDeleteServiceBookingKeys(cityBookingKey, tourKeys) {
	const cityBookingId = `cityBookings/${cityBookingKey}`;
	for (let i=0; i<tourKeys.length; i++) {
		tourKeys[i] = `tours/${tourKeys[i]}`;
	}
	let aqlQuery =
		`FOR c IN bookIn
  		FILTER c._to == @cityBookingId
  		FOR s IN bookIn
  			FILTER s._from == c._to
    		FOR t IN use
    			FILTER t._from == s._to
      		FOR tour IN @tours
      			FILTER tour == t._to
		RETURN s._to`;
	let result = db._query(aqlQuery, {'cityBookingId': cityBookingId, 'tours': tourKeys}).toArray();
	return result;
}

_cityBookings.getTours = getTours;
function getTours(cityBookingKey) {
	let result = [];
	const _cityBookingKey = removeCollectionFromKey(cityBookingKey);
	let services = db.bookIn.outEdges('cityBookings/' + _cityBookingKey);
	if (services) {
		let serviceKeys = [];
		for (let i=0; i<services.length; i++) {
			let serviceBookingKey = services[i]._to;
			serviceKeys.push(serviceBookingKey);
		}
		for (let j=0; j<serviceKeys.length; j++) {
			let edge = db.use.outEdges(serviceKeys[j]);
			if (edge) {
				let tourKey = removeCollectionFromKey(edge[0]._to);
				result.push(tourKey);
			}
		}
	}
	return result;
}

_cityBookings.addCityDay = addCityDay;
function addCityDay(cityBookingKey, dayIndex, cityday = {}) {
	let cityDay = db.cityDays.save(cityday);
	addToEdge('cityBookings', cityBookingKey, 'cityDays', cityDay._key, 'bookIn', {label: 'BookIn'});
	let updCityBooking = insertCityDay(cityBookingKey, cityDay._key, dayIndex);
	//console.log({cityDay: cityDay, cityBookingKey: cityBookingKey});
	return updCityBooking;
}

_cityBookings.patchTours = patchTours;
function patchTours(cityBookingKey, newTours) {
	let previousTours = getTours(cityBookingKey);
	let toDeleteTours = getArrayDiff(newTours, previousTours);
	let toCreateTours = getArrayDiff(previousTours, newTours);
	let toDeleteServiceBookingKeys = getDeleteServiceBookingKeys(cityBookingKey, toDeleteTours);
	deleteTours(toDeleteServiceBookingKeys);
	return saveTours({}, toCreateTours, cityBookingKey);
}

_cityBookings.bookCityBookingToTourplan = bookCityBookingToTourplan;
function bookCityBookingToTourplan(cityBookingKey) {
	const aqlQuery = `
	LET cityBookingId = CONCAT('cityBookings/', @cityBookingKey)
	LET nonBookedServiceBookings = (FOR serviceBooking IN 2..2 OUTBOUND cityBookingId GRAPH 'exo-dev'
    	FILTER IS_SAME_COLLECTION('serviceBookings', serviceBooking) && serviceBooking.status.state == 'Available'
    	RETURN serviceBooking._key)
	RETURN nonBookedServiceBookings`;
	const serviceBookingKeys = db._query(aqlQuery, {cityBookingKey}).next();
	const serviceBookingInfo = _serviceBookings.getBookingInfo(serviceBookingKeys);
	let batchResult = [];
	serviceBookingInfo.forEach((serviceBooking) => {
		const optionNumber = _serviceBookings.getOptionNumber(serviceBooking.serviceBookingKey);
		const params = {
			AgentID: 'uncircled',
			Password: 'kiril123',
			agentTPUID: 'user.agentTPUID',
			country: _serviceBookings.getCountry(serviceBooking.serviceBookingKey),
			OptionNumber: removeCountryCode(optionNumber),
			DateFrom: serviceBooking.startDay,
			SCUqty: serviceBooking.SCUqty
		};
		let tourplanBooking = _serviceBookings.bookServiceBookingToTourPlan(serviceBooking.serviceBookingKey, params);
		batchResult.push(tourplanBooking);
	});
	return batchResult;
}

_cityBookings.removeCityBookingToTourplan = removeCityBookingToTourplan;
function removeCityBookingToTourplan(cityBookingKey) {
	const aqlQuery = `
	LET cityBookingId = CONCAT('cityBookings/', @cityBookingKey)
	LET bookedServiceBookings = (FOR serviceBooking IN 2..2 OUTBOUND cityBookingId GRAPH 'exo-dev'
    	FILTER IS_SAME_COLLECTION('serviceBookings', serviceBooking) && serviceBooking.status.state == 'Booked'
    	RETURN serviceBooking._key)
	RETURN bookedServiceBookings`;
	const serviceBookingKeys = db._query(aqlQuery, {cityBookingKey}).next();
	let batchResult = [];
	serviceBookingKeys.forEach((serviceBookingKey) => {
		let params = {
			AgentID: 'uncircled',
			Password: 'kiril123',
			serviceBookingId: 'serviceBookings/' + serviceBookingKey,
			country: _serviceBookings.getCountry(serviceBookingKey)
		};
		let tourplanBooking = _serviceBookings.removeServiceBookingFromTourPlan(params);
		batchResult.push(tourplanBooking);
	});
	return batchResult;
}

// TEMP
_cityBookings.TEMP_addDateToCityBookings = TEMP_addDateToCityBookings;
function TEMP_addDateToCityBookings(cityBookings) {
	const Trips = require('../repositories/trips');
	let resultList = [];
	cityBookings.forEach((cityBooking) => {
		let aqlQuery = `
			LET cityBookingId = CONCAT('cityBookings/', @cityBookingKey)
			FOR trip IN 2..2 INBOUND cityBookingId GRAPH 'exo-dev'
    		FILTER IS_SAME_COLLECTION('trips', trip)
			RETURN trip._key`;

		let tripKey = db._query(aqlQuery, {'cityBookingKey': cityBooking._key}).next();
		Trips.updateStartDayAndDuration(tripKey);
		resultList.push(db._document(cityBooking._id));
	});
	return resultList;
}

_cityBookings.TEMP_addDateToCityBooking = TEMP_addDateToCityBooking;
function TEMP_addDateToCityBooking(cityBooking) {
	let res = TEMP_addDateToCityBookings([cityBooking]);
	let result;
	if (res.length > 0) {
		result = res[0];
	}
	else {
		result = cityBooking;
	}
	return result;
}
// END TEMP
