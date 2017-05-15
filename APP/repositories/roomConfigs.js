'use strict';
const db = require("@arangodb").db;
const _roomConfigs = db._collection('roomConfigs');
const _ = require('lodash');
const moment = require('moment');
module.exports = _roomConfigs;


function getTripPaxList(tripKey) {
	let aqlQuery = `
	LET tripId = CONCAT('trips/', @tripKey)
	LET trip = document(tripId)
	LET paxList = (FOR pax IN 1..1 OUTBOUND tripId GRAPH 'exo-dev'
		FILTER IS_SAME_COLLECTION('paxs', pax)
		RETURN pax)
	RETURN { paxList, tripStrtDate: trip.startDate }`;
	const { paxList, tripStrtDate } = db._query(aqlQuery, {tripKey: tripKey}).next();
	paxList.map(pax => calculatePaxAgeGroup(pax, tripStrtDate));
	return paxList;
}

function calculatePaxAgeGroup(pax, tripStartDate) {
	if (pax.ageGroup && pax.ageGroup !== '') {
		return;
	}

	let ageOnArrival;
	if (pax.dateOfBirth && pax.dateOfBirth !== '') {
		ageOnArrival = moment(new Date(tripStartDate)).diff(moment(pax.dateOfBirth, 'D MMMM, YYYY'), 'years');
	} else {
		ageOnArrival = pax.ageOnArrival;
	}
	const age = _.parseInt(ageOnArrival);

	if (age < 2) {
    pax.ageGroup = 'infants';
  } else if (age < 12) {
    pax.ageGroup = 'children';
  } else {  // eslint-disable-line no-else-return
    pax.ageGroup = 'adults';
  }
}

function getAccommodationPlacement(roomConfigKey) {
	let aqlQuery = `
	LET roomConfigId = CONCAT("roomConfigs/", @roomConfigKey)
	LET serviceBookingList = (FOR vertex, edges IN INBOUND roomConfigId bookIn RETURN edges)
	FOR serviceBooking IN serviceBookingList
    LET accommodationPlacementList = (FOR vertex, edges IN INBOUND serviceBooking._from bookIn RETURN edges)
    FOR acc IN accommodationPlacementList
    FOR accommodationPlacement IN accommodationPlacements
        FILTER accommodationPlacement._id == acc._from
        RETURN accommodationPlacement`;
	return db._query(aqlQuery, {roomConfigKey: roomConfigKey}).next();
}

function getAllOtherAccommodationPlacements(cityBookingKey, accommodationPlacementId) {
	let aqlQuery = `
	LET cityBookingId = CONCAT("cityBookings/", @cityBookingKey)
	LET accommodationPlacementList = (
    FOR vertex, edges IN OUTBOUND cityBookingId bookIn
        FILTER edges._to != @accommodationPlacementId
        RETURN edges._to)
    FOR accommodationPlacementId IN accommodationPlacementList
    FILTER IS_SAME_COLLECTION('accommodationPlacements', accommodationPlacementId)
    FOR accommodationPlacement IN accommodationPlacements
        FILTER accommodationPlacement._id == accommodationPlacementId
        RETURN accommodationPlacement`;
	return db._query(aqlQuery, {cityBookingKey: cityBookingKey, accommodationPlacementId: accommodationPlacementId}).toArray();
}

function isOverlappingAccommodationPlacement(startDayA, durationNightsA, startDayB, durationNightsB) {
	return startDayA <= durationNightsB && startDayB <= durationNightsA;
}

function getOverlappingAccommodationPlacements(accommodationPlacement, allOtheraccommodationPlacements) {
	let result = [];
	for (let i = 0; i < allOtheraccommodationPlacements.length; i++) {
		if (isOverlappingAccommodationPlacement(accommodationPlacement.startDay, accommodationPlacement.durationNights,
			allOtheraccommodationPlacements[i].startDay, allOtheraccommodationPlacements[i].durationNights)) {
			result.push(allOtheraccommodationPlacements[i]);
		}
	}
	return result;
}

function isInThisRoomConfig(paxId, roomConfigKey) {
	let aqlQuery = `
	LET roomConfigId = CONCAT("roomConfigs/", @roomConfigKey)
	LET paxList = (FOR pax IN 1..1 OUTBOUND roomConfigId GRAPH 'exo-dev' FILTER pax._id == @paxId RETURN pax)
	RETURN COUNT(paxList) == 0 ? false : true`;
	return db._query(aqlQuery, {paxId: paxId, roomConfigKey: roomConfigKey}).next();
}

function checkPAX(tripPaxList, accommodationPlacements, roomConfigKey) {
	let aqlQuery = `
  LET services = (FOR vertex, edges IN OUTBOUND @accommodationPlacementId bookIn RETURN edges)
    FOR service IN services
        LET roomConfigs = (FOR vertex, edges IN OUTBOUND service._to bookIn RETURN edges)
        FOR roomConfig IN roomConfigs
            LET paxs = (FOR vertex, edges IN OUTBOUND roomConfig._to participate RETURN vertex)
            FOR pax IN paxs
    RETURN pax`;
	let aqlAgeGroupCheck = `
	LET AgeGroup = @ageGroup
	LET services = (FOR vertex, edges IN OUTBOUND @accommodationPlacementId bookIn RETURN edges)
    FOR sevice IN services
        LET accommodations = (FOR vertex, edges IN OUTBOUND sevice._to use RETURN vertex)
        FOR accommodation IN accommodations
        RETURN accommodation.pax[AgeGroup].allowed`;
	let result = [];
	for (let i = 0; i < tripPaxList.length; i++) {
		let paxCount = 0;
		tripPaxList[i].paxStatuses = [];
		for (let j = 0; j < accommodationPlacements.length; j++) {
			let ageGroupOK = db._query(aqlAgeGroupCheck,
				{accommodationPlacementId: accommodationPlacements[j]._id, ageGroup: tripPaxList[i].ageGroup}).next();
			if (!ageGroupOK) {
				const message = `${tripPaxList[i].firstName} ${tripPaxList[i].lastName}, ${tripPaxList[i].ageGroup} not allowed.`;
				result.push({severity: 20, message: message});
			}
			let accommodationPlacementPaxList = db._query(aqlQuery,
				{accommodationPlacementId: accommodationPlacements[j]._id}).toArray();
			for (let n = 0; n < accommodationPlacementPaxList.length; n++) {
				if (tripPaxList[i]._id === accommodationPlacementPaxList[n]._id) {
					paxCount++;
				}
			}
		}
		if (paxCount === 0) {
			tripPaxList[i].paxStatuses.push({severity: 10, message: 'Traveller not assigned to any room.'});
			const message = `${tripPaxList[i].firstName} ${tripPaxList[i].lastName} not assigned to any room.`;
			result.push({severity: 10, message: message});
		}
		if (isInThisRoomConfig(tripPaxList[i]._id, roomConfigKey)) {
			if (paxCount > 1) {
				tripPaxList[i].paxStatuses.push({severity: 20, message: 'Traveller assigned to multiple rooms at same time.'});
				result.push({severity: 20, message: `${tripPaxList[i].firstName} ${tripPaxList[i].lastName} assigned to multiple rooms at same time.`});
			} else {
				tripPaxList[i].paxStatuses.push({severity: 0, message: 'OK'});
				result.push({severity: 0, message: `${tripPaxList[i].firstName} ${tripPaxList[i].lastName} OK`});
			}
		}
	}
	return result;
}

_roomConfigs.checkPAXStatuses = checkPAXStatuses;
function checkPAXStatuses(tripKey, cityBookingKey, roomConfigKey) {
	let tripPaxList = getTripPaxList(tripKey);
	let accommodationPlacement = getAccommodationPlacement(roomConfigKey);
	let allOtheraccommodationPlacements = getAllOtherAccommodationPlacements(cityBookingKey, accommodationPlacement._id);
	let overlaps = getOverlappingAccommodationPlacements(accommodationPlacement, allOtheraccommodationPlacements);
	let result = [];
	if (overlaps.length > 0) {
		overlaps.push(accommodationPlacement);
		result = checkPAX(tripPaxList, overlaps, roomConfigKey);
	} else {
		result = checkPAX(tripPaxList, [accommodationPlacement], roomConfigKey);
	}

	return result;
}

function updateErrors(updateParams) {
	const {roomConfigId, paxId, message, severity, errorType} = updateParams;
	const aqlAddPaxErrorEdge = `
		INSERT {_from: @roomConfigId, _to: @paxId, severity: @severity, message: @message, errorType: @errorType}
		IN error
		RETURN NEW`;
	const paxErrorEdge = db._query(aqlAddPaxErrorEdge, {roomConfigId, severity, message, errorType, paxId}).next();
	return {paxErrorEdge: paxErrorEdge};
}

function getTripAndCountryBookingKeys(roomConfigKey) {
	const aqlQuery = `
	LET roomConfigId = CONCAT('roomConfigs/', @roomConfigKey)
	LET tripKey = FIRST(
    FOR trip IN 5..5 INBOUND roomConfigId GRAPH 'exo-dev'
        FILTER IS_SAME_COLLECTION('trips', trip)
        RETURN trip._key)
	LET cityBookingKey = FIRST(
    FOR cityBooking IN 3..3 INBOUND roomConfigId GRAPH 'exo-dev'
        FILTER IS_SAME_COLLECTION('cityBookings', cityBooking)
        RETURN cityBooking._key)
	RETURN {tripKey: tripKey, cityBookingKey: cityBookingKey}`;
	return db._query(aqlQuery, {roomConfigKey}).next();
}

function getServiceType(roomConfigKey) {
	const aqlQuery = `
		LET roomConfigId = CONCAT('roomConfigs/', @roomConfigKey)
		FOR collection IN 2..2 INBOUND roomConfigId GRAPH 'exo-dev'
		RETURN PARSE_IDENTIFIER(collection._id).collection`;
	return db._query(aqlQuery, {roomConfigKey}).next();
}

function getServiceTypeDocument(roomConfigKey) {
	const aqlQuery = `
		LET roomConfigId = CONCAT('roomConfigs/', @roomConfigKey)
		FOR collection IN 2..2 INBOUND roomConfigId GRAPH 'exo-dev'
		RETURN collection`;
	return db._query(aqlQuery, {roomConfigKey}).next();
}

function getAllOtherServiceDocuments(cityBookingKey, serviceDocumentId, serviceType, edgeCollection) {
	const aqlQuery = `
		LET cityBookingId = CONCAT('cityBookings/', @cityBookingKey)
		FOR serviceDocument, serviceEdge IN 1..1 OUTBOUND cityBookingId GRAPH 'exo-dev'
    	FILTER IS_SAME_COLLECTION(@edgeCollection, serviceEdge) && IS_SAME_COLLECTION(@serviceType, serviceDocument) && (serviceDocument._id != @serviceDocumentId)
		RETURN serviceDocument`;
	return db._query(aqlQuery, {cityBookingKey, serviceDocumentId, serviceType, edgeCollection}).toArray();
}

function updatePAXStatuses(tripPaxList, accommodationPlacements, ageDocument, serviceType) {
	function getRoomConfigIds(_accommodationPlacements) {
		const result = [];
		_accommodationPlacements.forEach(function (accommodationPlacement) {
		const aqlRoomConfigIds =`
			FOR roomConfig IN 2..2 OUTBOUND @accommodationPlacementId GRAPH 'exo-dev'
	    			FILTER IS_SAME_COLLECTION('roomConfigs', roomConfig)
					RETURN roomConfig._id`;
		result.push(db._query(aqlRoomConfigIds, {accommodationPlacementId: accommodationPlacement._id}).toArray());
		});
		return [].concat([], ...result);
	}
	function clearErrors(roomConfigIds) {
		roomConfigIds.forEach(function (roomConfigId) {
			const aqlDeleteErrors = `
    			FOR pax, edge IN 1..1 OUTBOUND @roomConfigId GRAPH 'exo-dev'
        		FILTER IS_SAME_COLLECTION('error', edge)
        	REMOVE edge IN error`;
			db._query(aqlDeleteErrors, {roomConfigId}).next();
		});
	}
	function addAgeErrors(_tripPaxList, roomConfigIds, _ageDocument) {
		function getServiceDocumentId(roomConfigId, _serviceType) {
			const aqlGetServiceDocumentId = `
				FOR collection IN 2..2 INBOUND @roomConfigId GRAPH 'exo-dev'
				FILTER IS_SAME_COLLECTION(@serviceType, collection)
				RETURN collection._id`;
			return db._query(aqlGetServiceDocumentId, {roomConfigId: roomConfigId, serviceType: _serviceType}).next();
		}
		_tripPaxList.forEach(function (pax) {
			roomConfigIds.forEach(function (roomConfigId) {
				const serviceDocumentId = getServiceDocumentId(roomConfigId, serviceType);
				const aqlAgeGroupCheck = `
					FOR serviceDocument, edge IN 2..2 OUTBOUND @serviceDocumentId GRAPH 'exo-dev'
  					FILTER IS_SAME_COLLECTION(@ageDocument, serviceDocument) && IS_SAME_COLLECTION('use', edge)
  					RETURN serviceDocument.pax[@ageGroup].allowed`;
				const ageGroupOK = db._query(aqlAgeGroupCheck, {serviceDocumentId: serviceDocumentId, ageGroup: pax.ageGroup, ageDocument: _ageDocument}).next();
				if (!ageGroupOK) {
					const message = `${pax.firstName} ${pax.lastName}, ${pax.ageGroup} not allowed.`;
					updateErrors({roomConfigId: roomConfigId, paxId: pax._id, message: message, severity: 20, errorType: 'pax_agegroup_not_allowed'});
				}
			});
		});
	}
	function addDoubleBookErrors(_tripPaxList, roomConfigIds) {
		_tripPaxList.forEach(function (pax) {
			const roomConfigs = [];
			roomConfigIds.forEach(function (roomConfigId) {
				if (haveNoErrors(pax._id, roomConfigId)) {
					const aqlPaxInRoom = `
						LET paxList = (FOR pax IN 1..1 OUTBOUND @roomConfigId GRAPH 'exo-dev' FILTER pax._id == @paxId RETURN pax)
						RETURN COUNT(paxList) == 0 ? false : true`;
					if (db._query(aqlPaxInRoom, {roomConfigId: roomConfigId, paxId: pax._id}).next()) { roomConfigs.push(roomConfigId); }
				}
			});
			if (roomConfigs.length > 1) {
				roomConfigs.forEach(function (roomConfigId) {
					const message = `${pax.firstName} ${pax.lastName} assigned to multiple rooms at same time.`;
					updateErrors({roomConfigId: roomConfigId, paxId: pax._id, message: message, severity: 20, errorType: 'pax_double_book'});
				});
			}
		});
	}
	function addMissingPaxErrors(_tripPaxList, roomConfigIds) {
		_tripPaxList.forEach(function (pax) {
			const roomConfigs = [];
			roomConfigIds.forEach(function (roomConfigId) {
				if (haveNoErrors(pax._id, roomConfigId)) {
					const aqlPaxInRoom = `
						LET paxList = (FOR pax IN 1..1 OUTBOUND @roomConfigId GRAPH 'exo-dev'
							FILTER pax._id == @paxId RETURN pax)
							RETURN COUNT(paxList) == 0 ? true : false`;
					if (db._query(aqlPaxInRoom, {roomConfigId: roomConfigId, paxId: pax._id}).next()) { roomConfigs.push(roomConfigId); }
				}
			});
			if (roomConfigs.length === roomConfigIds.length) {
				roomConfigs.forEach(function (roomConfigId) {
					const message = `${pax.firstName} ${pax.lastName} not assigned to any room.`;
					updateErrors({roomConfigId: roomConfigId, paxId: pax._id, message: message, severity: 10, errorType: 'pax_missing'});
				});
			}
		});
	}
	function haveNoErrors(paxId, roomConfigId) {
		const aqlHaveNoErrors = `
			LET errorList = (FOR pax, edge IN 1..1 OUTBOUND @roomConfigId GRAPH 'exo-dev'
				FILTER IS_SAME_COLLECTION('error', edge) && pax._id == @paxId
				RETURN pax)
			RETURN COUNT(errorList) == 0 ? true : false`;
		return db._query(aqlHaveNoErrors, {roomConfigId, paxId}).next();
	}
	const roomConfigIds = getRoomConfigIds(accommodationPlacements);
	clearErrors(roomConfigIds);
	addAgeErrors(tripPaxList, roomConfigIds, ageDocument);
	addDoubleBookErrors(tripPaxList, roomConfigIds);
	addMissingPaxErrors(tripPaxList, roomConfigIds);
}

_roomConfigs.updateRoomConfigPaxes = updateRoomConfigPaxes;
function updateRoomConfigPaxes(roomConfigKey) {
	const {tripKey, cityBookingKey} = getTripAndCountryBookingKeys(roomConfigKey);
	const tripPaxList = getTripPaxList(tripKey);
	const serviceType = getServiceType(roomConfigKey);
	let result = {};
	switch (serviceType) {
		case 'accommodationPlacements': {
			const accommodationPlacement = getServiceTypeDocument(roomConfigKey);
			const accommodationPlacements = getOverlappingAccommodationPlacements(accommodationPlacement, getAllOtherServiceDocuments(cityBookingKey, accommodationPlacement._id, serviceType, 'bookIn'));
			accommodationPlacements.push(accommodationPlacement);
			result = updatePAXStatuses(tripPaxList, accommodationPlacements, 'accommodations', serviceType, roomConfigKey);
			break;
		}
		case 'cityDays': {
			// const cityDay = getServiceTypeDocument(roomConfigKey);
			break;
		}
		case 'transferPlacements': {
			break;
		}
		default: {
			break;
		}
	}
	return result;
}
