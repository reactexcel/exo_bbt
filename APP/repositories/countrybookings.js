'use strict';
const db = require('@arangodb').db;
const removeCollectionFromKey = require('../utils').removeCollectionFromKey;
const removeCountryCode = require('../utils/serversAndCountries').removeCountryCode;

const _cityBookings = require('./citybookings');
const _serviceBookings = require('./servicebookings');
const _countryBookings = db._collection('countryBookings');
module.exports = _countryBookings;

/*eslint no-param-reassign: 1*/
/*eslint camelcase: 1*/
/*eslint global-require: 1*/
/*eslint new-cap: 1*/
/*eslint no-else-return: 1*/

_countryBookings.addCityBookingKeyToCountryBooking = addCityBookingKeyToCountryBooking;
function addCityBookingKeyToCountryBooking(countryBookingKey, cityKey, cityIndex) {
	let countryBooking = db.countryBookings.document(countryBookingKey);
	let cityOrder = countryBooking.cityOrder;
	if (cityOrder) {
		// Add to specific index if specified
		if (typeof (cityIndex) === 'number') {
			cityOrder.splice(cityIndex, 0, cityKey);
		}
		// Add as last element by default
		else {
			cityOrder.push(cityKey);
		}
	}
	else {
		cityOrder = [cityKey];
	}
	countryBooking.cityOrder = cityOrder;
	this.update(countryBookingKey, countryBooking);
}

_countryBookings.getServiceBookings = getServiceBookings;
function getServiceBookings(countryBookingKey) {
	const _countryBookingKey = removeCollectionFromKey(countryBookingKey);
	let result = {};
	let countryBooking = db.countryBookings.document(_countryBookingKey);
	if (countryBooking) {
		result = countryBooking;
		let cities = db.bookIn.outEdges('countryBookings/'+_countryBookingKey);
		if (cities) {
			let cityBookings = [];
			for (let i=0; i<cities.length; i++) {
				let cityBookingKey = cities[i]._to;
				let cityBooking = _cityBookings.getServiceBookings(cityBookingKey);
				if (cityBooking) {
					cityBookings.push(cityBooking);
				}
			}
			result.cityBookings = cityBookings;
		}
	}
	return result;
}

_countryBookings.bookCountryBookingToTourplan = bookCountryBookingToTourplan;
function bookCountryBookingToTourplan(countryBookingKey) {
	let aqlQuery = `
	LET countryBookingId = CONCAT('countryBookings/', @countryBookingKey)
	LET nonBookedServiceBookings = (FOR serviceBooking IN 3..3 OUTBOUND countryBookingId GRAPH 'exo-dev'
    	FILTER IS_SAME_COLLECTION('serviceBookings', serviceBooking) && serviceBooking.status.state == 'Available'
    	RETURN serviceBooking._key)
	RETURN nonBookedServiceBookings`;
	let serviceBookingKeys = db._query(aqlQuery, {countryBookingKey}).next();
	let serviceBookingInfo = _serviceBookings.getBookingInfo(serviceBookingKeys);
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

_countryBookings.removeCountryBookingToTourplan = removeCountryBookingToTourplan;
function removeCountryBookingToTourplan(countryBookingKey) {
	const aqlQuery = `
	LET countryBookingId = CONCAT('countryBookings/', @countryBookingKey)
	LET bookedServiceBookings = (FOR serviceBooking IN 3..3 OUTBOUND countryBookingId GRAPH 'exo-dev'
    	FILTER IS_SAME_COLLECTION('serviceBookings', serviceBooking) && serviceBooking.status.state == 'Booked'
    	RETURN serviceBooking._key)
	RETURN bookedServiceBookings`;
	const serviceBookingKeys = db._query(aqlQuery, {countryBookingKey}).next();
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
_countryBookings.TEMP_addDateToCountryBookings = TEMP_addDateToCountryBookings;
function TEMP_addDateToCountryBookings(countryBookings) {
	const Trips = require('../repositories/trips');
	let resultList = [];
	countryBookings.forEach((countryBooking) => {
		let aqlQuery = `
			LET countryBookingId = CONCAT('countryBookings/', @countryBookingKey)
			FOR trip IN 1..1 INBOUND countryBookingId GRAPH 'exo-dev'
    		FILTER IS_SAME_COLLECTION('trips', trip)
			RETURN trip._key`;
		let tripKey = db._query(aqlQuery, {'countryBookingKey': countryBooking._key}).next();
		Trips.updateStartDayAndDuration(tripKey);
		resultList.push(db._document(countryBooking._id));
	});

	return resultList;
}

_countryBookings.TEMP_addDateToCountryBooking = TEMP_addDateToCountryBooking;
function TEMP_addDateToCountryBooking(countryBooking) {
	let res = TEMP_addDateToCountryBookings([countryBooking]);
	let result;
	if (res.length > 0) {
		result = res[0];
	}
	else {
		result = countryBooking;
	}
	return result;
}
// END TEMP
