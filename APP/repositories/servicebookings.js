'use strict';
const db = require("@arangodb").db;
const request = require('@arangodb/request');
const XMLMapping = require('xml-mapping');
const _ = require('lodash');
const bbj2j = require('jsonapter');
const removeCollectionFromKey = require('../utils').removeCollectionFromKey;
const getTourplanUpdateBooking = require('../utils/tpXMLScripts').getTourplanUpdateBookingXML;
const getTourPlanNewBookingXML = require('../utils/tpXMLScripts').getTourPlanNewBookingXML;
const getCancelSingleServiceBookingXML = require('../utils/tpXMLScripts').getCancelSingleServiceBookingXML;
const removeCountryCode = require('../utils/serversAndCountries').removeCountryCode;
const countryCodes = require('../utils/serversAndCountries').countryCodes;
const servers = require('../utils/serversAndCountries').servers;
const moment = require('moment');

const _serviceBookings = db._collection('serviceBookings');
module.exports = _serviceBookings;
const j2j = bbj2j.instance();

let globalRequestXML = {};

/*  Force status to 'OK'
<Request>
	<UpdateServiceRequest>
		<AgentID>uncircled</AgentID>
		<Password>kiril123</Password>
		<Ref>ECI2219707</Ref>
		<ServiceLineId>5972008</ServiceLineId>
		 <TourplanServiceStatus>OK</TourplanServiceStatus>
     <SupplierConfirmation>Updated Sup Conf</SupplierConfirmation>
	</UpdateServiceRequest>
</Request>
*/

/* Check status of service
<Request>
	<GetBookingRequest>
		<AgentID>uncircled</AgentID>
		<Password>kiril123</Password>
		<Ref>ECI2219707</Ref>
	</GetBookingRequest>
</Request>
*/

/*eslint no-param-reassign: 1*/
/*eslint camelcase: 1*/
/*eslint global-require: 1*/
/*eslint new-cap: 1*/
/*eslint no-else-return: 1*/
/*eslint no-console: 1*/
/*eslint no-unused-vars: 1*/

// -- Local functions --

function checkServiceBooking(serviceBookingKey) {
	const aqlCheckServiceBooking = `
		let serviceBookingId = concat('serviceBookings/', @serviceBookingKey)
		let serviceBooking = document(serviceBookingId)
		let isConfirmed = (
    	serviceBooking.status.isConfirmed ||
    	(((serviceBooking.status.tpAvailabilityStatus == "RQ") || (serviceBooking.status.tpAvailabilityStatus == "OK")) &&
    	(serviceBooking.status.state == "Available")))
		let countryBookingRef = FIRST(for countryBooking in 3..3 inbound serviceBookingId graph 'exo-dev' filter is_same_collection('countryBookings', countryBooking) return countryBooking.tpBookingRef)
		return {
    	tpBookingRef: countryBookingRef,
    	tpAvailabilityStatus: serviceBooking.status.tpAvailabilityStatus,
    	tpBookingStatus: serviceBooking.status.tpBookingStatus,
			state: serviceBooking.status.state,
    	isConfirmed: isConfirmed,
    	forceBooking: isConfirmed
		}`;
	return db._query(aqlCheckServiceBooking, {
		serviceBookingKey: serviceBookingKey
	}).next();
}

function forceServiceBooking(tourplanServerUrl, tpBookingRef, serviceLineId, forcedValue) {
	const forceXML = `<?xml version="1.0"?><!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
		<Request>
			<UpdateServiceRequest>
				<AgentID>uncircled</AgentID>
				<Password>kiril123</Password>
				<Ref>${tpBookingRef}</Ref>
				<ServiceLineId>${serviceLineId}</ServiceLineId>
		 		<TourplanServiceStatus>${forcedValue}</TourplanServiceStatus>
     		<SupplierConfirmation>Updated Sup Conf</SupplierConfirmation>
			</UpdateServiceRequest>
		</Request>`;
	request({
		method: 'post',
		url: tourplanServerUrl,
		body: forceXML,
		timeout: 120000
	});
}

function getServiceBookingStatus(tourplanServerUrl, tpBookingRef, serviceLineId) {
	let result = '';
	const checkServiceXML = `<?xml version="1.0"?><!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
		<Request>
			<GetBookingRequest>
				<AgentID>uncircled</AgentID>
				<Password>kiril123</Password>
				<Ref>${tpBookingRef}</Ref>
			</GetBookingRequest>
		</Request>`;
	let tpReturn = request({
		method: 'post',
		url: tourplanServerUrl,
		body: checkServiceXML,
		timeout: 120000
	});
	let xml = tpReturn.body;
	let json = XMLMapping.load(xml);
	if (json.Reply.GetBookingReply.Services.Service.length) {
		json.Reply.GetBookingReply.Services.Service.map((service) => {
			if (service.ServiceLineId.$t === serviceLineId) {
				result = service.Status.$t;
				return result;
			}
		});
	} else if (json.Reply.GetBookingReply.Services.Service.ServiceLineId.$t === serviceLineId) {
			result = json.Reply.GetBookingReply.Services.Service.Status.$t;
			return result;
		}
	return result;
}

function setServiceBookingOnRequest(tourplanServerUrl, serviceBookingKey, serviceLineId, sequenceNumber, currentStatus, stateStr, newBookingRef) {
	let patchDataServiceBooking = {
		serviceLineId: Number(serviceLineId),
		serviceSequenceNumber: Number(sequenceNumber),
		status: {
			tpBookingStatus: currentStatus,
			state: stateStr
		}
	};
	const checkResult = checkServiceBooking(serviceBookingKey);
	let tpBookingRef = newBookingRef ? newBookingRef : checkResult.tpBookingRef;
	if (checkResult.forceBooking) {
		forceServiceBooking(tourplanServerUrl, tpBookingRef, serviceLineId, 'OK');
		const serviceStatus = getServiceBookingStatus(tourplanServerUrl, tpBookingRef, serviceLineId);
		patchDataServiceBooking.status.tpBookingStatus = 'OK'; //(serviceStatus === '') ? currentStatus : serviceStatus; { //TODO: temporarily handle RQ as OK and make sure status is OK
		patchDataServiceBooking.status.state = (serviceStatus === '') ? stateStr : 'Booked';
	}
	return patchDataServiceBooking;
}

function removePreselection(serviceBookingKey) {
	let aqlQuery = `
	LET ServiceBookingId = CONCAT("serviceBookings/",@ServiceBookingKey)
	LET TourId = FIRST((FOR vertex, edge IN OUTBOUND ServiceBookingId use RETURN edge))._to
	FOR preselection IN preselect
    FILTER preselection._to == TourId
	REMOVE preselection IN preselect`;
	return db._query(aqlQuery, {
		'ServiceBookingKey': serviceBookingKey
	}).next();
}

function addPreselection(serviceBookingKey, newCityDayKey, startSlot) {
	let aqlQuery = `
	LET ServiceBookingId = CONCAT("serviceBookings/",@ServiceBookingKey)
	LET CityDayId = CONCAT("cityDays/", @cityDayKey)
	LET TourId = FIRST((FOR vertex, edge IN OUTBOUND ServiceBookingId use RETURN edge))._to
	INSERT {"_from":CityDayId, "_to":TourId, "startSlot":@startSlot} IN preselect RETURN NEW`;
	return db._query(aqlQuery, {
		'ServiceBookingKey': serviceBookingKey,
		'cityDayKey': newCityDayKey,
		'startSlot': startSlot
	}).toArray();
}

function moveServiceBookingToCityDay(serviceBookingKey, newCityDayKey) {
	let removeCityDayQuery = `
	LET sbId = CONCAT("serviceBookings/",@ServiceBookingKey)
	LET cdId = FIRST((FOR vertex, edge IN INBOUND sbId bookIn RETURN edge))._from
	FOR edge IN bookIn
  	FILTER edge._from == cdId && edge._to == sbId
  	REMOVE edge IN bookIn`;
	db._query(removeCityDayQuery, {
		'ServiceBookingKey': serviceBookingKey
	}).next();
	let addCityDayQuery = `
	LET ServiceBookingId = CONCAT("serviceBookings/",@ServiceBookingKey)
	LET CityDayId = CONCAT("cityDays/", @cityDayKey)
	INSERT {"_from":CityDayId, "_to":ServiceBookingId, "label":"BookIn"} IN bookIn RETURN NEW`;
	return db._query(addCityDayQuery, {
		'ServiceBookingKey': serviceBookingKey,
		'cityDayKey': newCityDayKey
	}).next();
}

function updateServiceBookingStartSlot(serviceBookingKey, startSlot) {
	let aqlQuery = `
	FOR sb IN serviceBookings
  		FILTER sb._key == @ServiceBookingKey
  		UPDATE sb WITH {startSlot:@startSlot} IN serviceBookings
  		RETURN NEW`;
	return db._query(aqlQuery, {
		'ServiceBookingKey': serviceBookingKey,
		'startSlot': startSlot
	}).toArray();
}

function getCityBookingId(serviceBookingKey) {
	let aqlQuery = `
	LET ServiceBookingId = CONCAT("serviceBookings/", @ServiceBookingKey)
	LET CityDayId = FIRST((FOR vertex, edge IN INBOUND ServiceBookingId bookIn RETURN edge))._from
	LET CityBookingId = FIRST((FOR vertex, edge IN INBOUND CityDayId bookIn RETURN edge))._from
	RETURN CityBookingId`;
	return db._query(aqlQuery, {
		'ServiceBookingKey': serviceBookingKey
	}).next();
}

function isPreselected(serviceBookingKey) {
	let aqlQuery = `
	LET ServiceBookingId = CONCAT("serviceBookings/",@ServiceBookingKey)
	LET CityDayId = FIRST((FOR vertex, edge IN INBOUND ServiceBookingId bookIn RETURN edge))._from
	LET TourId = FIRST((FOR vertex, edge IN OUTBOUND ServiceBookingId use RETURN edge))._to
	LET PreselectedCityDayId = FIRST((FOR vertex, edge IN INBOUND TourId preselect RETURN edge))._from
	LET isPreselected = PreselectedCityDayId == CityDayId
	RETURN isPreselected`;
	return db._query(aqlQuery, {
		'ServiceBookingKey': serviceBookingKey
	}).next();
}

function getCountryBookingX(serviceBookingKey) {
	let aqlQuery = `
	LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
	FOR countryBookings IN 3..3 INBOUND serviceBookingId GRAPH 'exo-dev'
    	FILTER IS_SAME_COLLECTION('countryBookings', countryBookings)
		RETURN countryBookings`;
	return db._query(aqlQuery, {
		serviceBookingKey
	}).next();
}

function getRoomConfigs(serviceBookingKey) {
	let aqlQuery = `
	LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
		LET roomConfigs = (FOR roomConfigVertex IN 1..1 OUTBOUND serviceBookingId GRAPH 'exo-dev'
    FILTER IS_SAME_COLLECTION('roomConfigs', roomConfigVertex)
    LET roomType = SUBSTITUTE(UPPER(TRIM(roomConfigVertex.roomType)), ['SINGLE', 'DOUBLE', 'TWIN', 'TRIPLE', 'QUAD'], ['SG', 'DB', 'TW', 'TR', 'QD'] )
    RETURN MERGE(roomConfigVertex, {roomType: roomType}))
    LET roomConfigList = LENGTH(roomConfigs) == 0 ? [{'roomType': 'SG'}] : roomConfigs
    FOR roomConfig IN roomConfigList RETURN roomConfig`;
	return db._query(aqlQuery, {
		serviceBookingKey
	}).toArray();
}

function getRoomConfigPaxList(serviceBookingId, roomConfig) {
	let startNode = (roomConfig._id) ? roomConfig._id : serviceBookingId;
	let aqlQuery = `
	FOR paxs IN 1..1 OUTBOUND @startNode GRAPH 'exo-dev'
	FILTER IS_SAME_COLLECTION('paxs', paxs)
    LET paxtype = SUBSTITUTE(paxs.ageGroup, ['adults', 'children', 'infants'], ['A', 'C', 'I'])
    RETURN CONCAT('<PaxDetails>', '<Title>',paxs.title,'</Title>',
        '<Forename>', paxs.firstName, '</Forename>',
        '<Surname>', paxs.lastName, '</Surname>',
        '<PaxType>', paxtype, '</PaxType>', '</PaxDetails>')`;
	return db._query(aqlQuery, {
		startNode: startNode
	}).toArray();
}

function getPaxCounts(serviceBookingId, roomConfig) {
	let startNode = (roomConfig._id) ? roomConfig._id : serviceBookingId;
	let aqlQuery = `
	LET countAdults = LENGTH((FOR paxs IN 1..1 OUTBOUND @startNode GRAPH 'exo-dev'
    	FILTER paxs.ageGroup == 'adults'
    	RETURN paxs))
	LET countChildren = LENGTH((FOR paxs IN 1..1 OUTBOUND @startNode GRAPH 'exo-dev'
    	FILTER paxs.ageGroup == 'children'
    	RETURN paxs))
	LET countInfants = LENGTH((FOR paxs IN 1..1 OUTBOUND @startNode GRAPH 'exo-dev'
    	FILTER paxs.ageGroup == 'infants'
    	RETURN paxs))
	RETURN CONCAT('<Adults>',countAdults,'</Adults><Children>',countChildren,'</Children><Infants>',countInfants,'</Infants>')`;
	return db._query(aqlQuery, {
		startNode: startNode
	}).next();
}

function getRoomConfigsXML(serviceBookingId, roomConfigs, params) {
	const newOrUpdate = (params.Ref)
		? `<ExistingBookingInfo>
			<Ref>${params.Ref}</Ref>
 	 	</ExistingBookingInfo>`
		: `<NewBookingInfo>
  			<Name>${params.LeadPaxName}</Name>
    		<QB>B</QB>
 		</NewBookingInfo>`;

	const roomConfigsList = roomConfigs.map(function (roomConfig) {
		const emptyRoomConfig = (roomConfig._id && !hasPAX(roomConfig._id));
		const PAXS = getRoomConfigPaxList(serviceBookingId, roomConfig);
		const paxCounts = getPaxCounts(serviceBookingId, roomConfig);
		const paxList = PAXS.map(function (pax) {
			return pax;
		});
		return emptyRoomConfig ? ``
			: `<RoomConfig>
				${paxCounts}
				<RoomType>${roomConfig.roomType}</RoomType>
				<PaxList>
					${paxList.join('')}
				</PaxList>
			</RoomConfig>`;
	});

	return `
		<?xml version="1.0"?><!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
  		<Request>
   			<AddServiceRequest>
       			<AgentID>${params.AgentID}</AgentID>
       			<Password>${params.Password}</Password>
       			${newOrUpdate}
       			<OptionNumber>${params.OptionNumber}</OptionNumber>
       			<RateId>Default</RateId>
       			<DateFrom>${params.DateFrom}</DateFrom>
       			<RoomConfigs>
					${roomConfigsList.join('')}
				</RoomConfigs>
       			<SCUqty>${params.SCUqty}</SCUqty>
       			<Consult>TAU UID</Consult>
       			<AgentRef>TAU Reference</AgentRef>
       			<puTime>0800</puTime>
       			<puRemark>Hotel lobby</puRemark>
       			<doTime>1800</doTime>
       			<doRemark>Hotel Lobby</doRemark>
       			<Remarks>notes go here</Remarks>
   			</AddServiceRequest>
		</Request>`;
}

function getTourplanBookingXML(serviceBookingKey, params) {
	let roomConfigs = getRoomConfigs(serviceBookingKey);
	let roomConfigsXML = getRoomConfigsXML('serviceBookings/' + serviceBookingKey, roomConfigs, params);
	return roomConfigsXML;
}

function addLeadPax(serviceBookingKey, params) {
	let aqlQuery = `
		LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
		LET proposal = FIRST(FOR proposal IN 5..5 INBOUND serviceBookingId GRAPH 'exo-dev'
		FILTER !IS_NULL(proposal) && IS_SAME_COLLECTION('proposals', proposal)
		RETURN proposal)

		LET mainPax = FIRST(FOR paxs, paxEdges, p IN 1..1 OUTBOUND proposal._id GRAPH 'exo-dev'
		FILTER paxEdges.isMainPax RETURN paxs)

		RETURN TRIM(CONCAT(mainPax.firstName == NULL ? 'Undefined first name' : mainPax.firstName, ' ',
  	mainPax.lastName == NULL ? 'Undefined last name' : mainPax.lastName))`;
	Object.assign(params, params, {
		LeadPaxName: db._query(aqlQuery, {
			serviceBookingKey
		}).next()
	});
}

function hasPAX(startNode) {
	let aqlQuery = `
	LET assignedPax = COUNT(FOR pax, edge IN 1..2 OUTBOUND @startNode GRAPH 'exo-dev'
		FILTER IS_SAME_COLLECTION('participate', edge)
		RETURN pax)
	RETURN assignedPax != 0 ? true : false`;
	return db._query(aqlQuery, {
		startNode
	}).next();
}

function patchCountryBooking(countryBookingKey, patchData) {
	return updateCountryBooking(countryBookingKey, patchData.tpBookingId, patchData.tpBookingRef);
}

function patchServiceBooking(serviceBookingKey, patchData) {
	return updateServiceBooking(serviceBookingKey, patchData);
}

function cancelServiceBooking(tourplanServerUrl, cancelXML) {
	let result = false;
	let tpReturn = request({
		method: 'post',
		url: tourplanServerUrl,
		body: cancelXML,
		timeout: 120000
	});
	let xml = tpReturn.body;
	let json = XMLMapping.load(xml);

	if (_.has(json, 'Reply.DeleteServiceReply.Status.$t')) {
		result = json.Reply.DeleteServiceReply.Status.$t;
	}
	return result;
}

function isBooked(countryBookingId) {
	let aqlQuery = `
	LET countryBooking = FIRST(FOR countryBookings IN 0..0 ANY @countryBookingId GRAPH 'exo-dev' RETURN countryBookings)
	LET isBooked = countryBooking.tpBookingRef ? true : false
	RETURN isBooked`;
	return db._query(aqlQuery, {
		countryBookingId
	}).next();
}

function updateCountryBooking(countryBookingKey, tpBookingId, tpBookingRef) {
	let _countryBookingKey = removeCollectionFromKey(countryBookingKey);
	let result = null;
	let patchData = {
		"tpBookingId": tpBookingId,
		"tpBookingRef": tpBookingRef
	};
	result = db.countryBookings.update(_countryBookingKey, patchData, true);
	return result;
}

function getAllOtherServiceBookings(cityDayKey, serviceBookingId) {
	let aqlQuery = `
	LET cityDayId = CONCAT("cityDays/", @cityDayKey)
	FOR vertex, edges IN OUTBOUND cityDayId bookIn
    FILTER edges._to != @serviceBookingId
		RETURN vertex`;
	return db._query(aqlQuery, {
		cityDayKey: cityDayKey,
		serviceBookingId: serviceBookingId
	}).toArray();
}

function getTripPaxList(tripKey) {
	let aqlQuery = `
	LET tripId = CONCAT("trips/", @tripKey)
	LET trip = document(tripId)
	LET tripPaxList = (FOR vertex, edges IN OUTBOUND tripId participate RETURN vertex)
	RETURN { tripPaxList, tripStrtDate: trip.startDate }`;
	return db._query(aqlQuery, {
		tripKey: tripKey
	}).next();
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
	} else { // eslint-disable-line no-else-return
		pax.ageGroup = 'adults';
	}
}


function isOverlapping(startSlotA, durationSlotsA, startSlotB, durationSlotsB) {
	//return startSlotA <= durationSlotsB && startSlotB <= durationSlotsA;
	const slotsA = [startSlotA];
	const slotsB = [startSlotB];
	for (let i = 1; i < durationSlotsA; i++) {
		slotsA.push(startSlotA + i);
	}
	for (let j = 1; j < durationSlotsB; j++) {
		slotsB.push(startSlotB + j);
	}
	const intersectionSlots = _.intersection(slotsA, slotsB);
	return intersectionSlots.length > 0;
}

function getOverlappingServiceBookings(serviceBooking, allOtherServiceBookings) {
	let result = [];
	for (let i = 0; i < allOtherServiceBookings.length; i++) {
		if (isOverlapping(
				serviceBooking.startSlot,
				serviceBooking.durationSlots,
				allOtherServiceBookings[i].startSlot,
				allOtherServiceBookings[i].durationSlots)) {
			result.push(allOtherServiceBookings[i]);
		}
	}
	return result;
}

function checkPAX(tripPaxList, serviceBookings) {
	// citydays serviceBookings --BookIn--> RoomConfigs --Participate--> pax now.
	let aqlQuery = `
	FOR vertex, edges IN 2..2 OUTBOUND @serviceBookingId GRAPH 'exo-dev'
	FILTER IS_SAME_COLLECTION('paxs', vertex)
	RETURN vertex
	`;
	let aqlAgeGroupCheck = `
	LET tours = (FOR vertex, edges IN OUTBOUND @serviceBookingId use RETURN vertex)
    FOR tour IN tours
      RETURN tour.pax[@ageGroup].allowed`;
	let result = [];
	for (let i = 0; i < tripPaxList.length; i++) {
		let paxCount = 0;
		tripPaxList[i].paxStatuses = [];
		for (let j = 0; j < serviceBookings.length; j++) {
			let ageGroupOK = db._query(aqlAgeGroupCheck, {
				serviceBookingId: serviceBookings[j]._id,
				ageGroup: tripPaxList[i].ageGroup
			}).next();
			if (!ageGroupOK) {
				result.push({
					severity: 20,
					message: `${tripPaxList[i].firstName} ${tripPaxList[i].lastName}, ${tripPaxList[i].ageGroup} not allowed.`
				});
			}
			let serviceBookingPaxList = db._query(aqlQuery, {
				serviceBookingId: serviceBookings[j]._id
			}).toArray();
			for (let n = 0; n < serviceBookingPaxList.length; n++) {
				if (tripPaxList[i]._id === serviceBookingPaxList[n]._id) {
					paxCount++;
				}
			}
		}
		if (paxCount === 0) {
			tripPaxList[i].paxStatuses.push({
				severity: 10,
				message: 'Traveller not assigned to any tour.'
			});
			result.push({
				severity: 10,
				message: `${tripPaxList[i].firstName} ${tripPaxList[i].lastName} not assigned to any tour.`
			});
		} else if (paxCount > 1) {
			tripPaxList[i].paxStatuses.push({
				severity: 20,
				message: 'Traveller assigned to multiple tours at same time.'
			});
			result.push({
				severity: 20,
				message: `${tripPaxList[i].firstName} ${tripPaxList[i].lastName} assigned to multiple tours at same time.`
			});
		} else {
			tripPaxList[i].paxStatuses.push({
				severity: 0,
				message: 'OK'
			});
			result.push({
				severity: 0,
				message: `${tripPaxList[i].firstName} ${tripPaxList[i].lastName} OK`
			});
		}
	}
	return result;
}

function getAccDateInfo(serviceBookingKey) {
	let aqlQuery = `
	    LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
		LET tripStartDate = FIRST(FOR trip IN 4..4 INBOUND serviceBookingId GRAPH 'exo-dev'
    		FILTER HAS(trip, 'startDate')
    		RETURN trip.startDate)
  		LET accDate = FIRST(FOR res IN 1..1 INBOUND serviceBookingId GRAPH 'exo-dev' RETURN res)
		LET dateAdd = DATE_ADD(tripStartDate, CONCAT('P', TO_STRING(accDate.startDay-1), 'D'))
		LET newYear = TO_STRING(DATE_YEAR(dateAdd))
		LET newMonth = DATE_MONTH(dateAdd) < 10 ? CONCAT('0', TO_STRING(DATE_MONTH(dateAdd))) : TO_STRING(DATE_MONTH(dateAdd))
		LET newDay = DATE_DAY(dateAdd) < 10 ? CONCAT('0', DATE_DAY(dateAdd)) : TO_STRING(DATE_DAY(dateAdd))
		LET newDate = CONCAT(newYear, '-', newMonth, '-', newDay)
		RETURN {type: 'Accommodation', serviceBookingKey: TO_STRING(@serviceBookingKey),
			serviceBookingId: TO_STRING(CONCAT('serviceBookings/', @serviceBookingKey)),
			startDay: newDate, SCUqty: accDate.durationNights}`;
	return db._query(aqlQuery, {
		serviceBookingKey
	}).next();
}

function getTransferStartDay(serviceBookingKey) {
	let tripKey = getTripKey(serviceBookingKey);
	let aqlQuery = `
	LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
	LET cityDayId = FIRST(FOR cityBooking IN 2..2 INBOUND serviceBookingId GRAPH 'exo-dev'
    LET cityDay = LENGTH(cityBooking.dayOrder) > 0 ? cityBooking.dayOrder[LENGTH(cityBooking.dayOrder)-1] : null
    	RETURN FIRST(FOR cd IN 0..0 ANY CONCAT('cityDays/', cityDay) GRAPH 'exo-dev' RETURN cd._id))
	RETURN cityDayId`;
	let cityDayId = db._query(aqlQuery, {
		serviceBookingKey
	}).next();
	let result = getStartDay(tripKey, cityDayId);
	return result;
}

function getTransferDateInfo(serviceBookingKey) {
	return {
		serviceBookingKey: serviceBookingKey,
		serviceBookingId: `serviceBookings/${serviceBookingKey}`,
		type: 'Transfer',
		startDay: getTransferStartDay(serviceBookingKey),
		SCUqty: 1
	};
}

function getStartDay(tripKey, cityDayId) {
	let myReturn;
	//let trip = db.trips.document(tripKey);

	let aqlQuery = `
		LET tripId = CONCAT("trips/", @tripKey)
		LET trip = DOCUMENT(tripId)
		LET tripCountryOrder = NOT_NULL(trip.countryOrder) ? trip.countryOrder : []
		LET countryBookings = (
    FOR countryBookingKey IN tripCountryOrder
	    LET countryBookingId = CONCAT("countryBookings/", countryBookingKey)
		LET countryBooking = DOCUMENT(countryBookingId)
		LET countryBookingCityOrder = NOT_NULL(countryBooking.cityOrder) ? countryBooking.cityOrder : []
		RETURN MERGE(countryBooking, {cityBookings: (
		    FOR cityBookingKey IN countryBookingCityOrder
		        LET cityBookingId = CONCAT("cityBookings/", cityBookingKey)
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
								LET cityDayId = CONCAT("cityDays/", cityDayKey)
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
						)})
				)})
		)
		RETURN MERGE(trip, {countryBookings: countryBookings})`;

	let result = db._query(aqlQuery, {
		'tripKey': tripKey
	}).next();

	const dateFormat = "YYYY-MM-DD";

	let startDate = moment(result.startDate);
	let lastDay = 0;
	let lastDate = startDate;

	// Inject dates
	result.countryBookings.forEach((countryBooking, i) => {
		countryBooking.cityBookings.forEach((cityBooking, j) => {
			cityBooking.cityDays.forEach((cityDay, k) => {
				// Inject cityDay
				cityDay.startDay = lastDay + 1;
				cityDay.startDate = lastDate.format(dateFormat);

				if (cityDay._id === cityDayId) {
					myReturn = lastDate.format(dateFormat);
				}

				lastDate = lastDate.add(1, 'd');
				lastDay += 1;
			});

			// Inject cityBooking
			if (cityBooking.cityDays && cityBooking.cityDays[0]) {
				cityBooking.durationDays = cityBooking.cityDays.length;
				cityBooking.durationNights = cityBooking.cityDays.length - 1;
				cityBooking.startDay = cityBooking.cityDays[0].startDay;
				cityBooking.startDate = cityBooking.cityDays[0].startDate;
			}
		});

		// Inject countryBooking
		if (countryBooking.cityBookings && countryBooking.cityBookings[0]) {
			let durationDays = 0;

			countryBooking.cityBookings.forEach((c) => {
				if (c.cityDays.length) {
					durationDays += c.cityDays.length;
				}
			});

			countryBooking.durationDays = durationDays;
			countryBooking.durationNights = durationDays - 1;
			countryBooking.startDay = countryBooking.cityBookings[0].startDay;
			countryBooking.startDate = countryBooking.cityBookings[0].startDate;
		}
	});

	return myReturn;
}

function getCityDayId(serviceBookingKey) {
	let aqlQuery = `
	LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
	LET cityDayId = FIRST(FOR cityDay IN 1..1 INBOUND serviceBookingId GRAPH 'exo-dev' RETURN cityDay._id)
		RETURN cityDayId`;
	return db._query(aqlQuery, {
		serviceBookingKey
	}).next();
}

function getTourStartDay(serviceBookingKey) {
	let tripKey = getTripKey(serviceBookingKey);
	let cityDayId = getCityDayId(serviceBookingKey);
	let result = getStartDay(tripKey, cityDayId);
	return result;
}

function getTourDateInfo(serviceBookingKey) {
	return {
		serviceBookingKey: serviceBookingKey,
		serviceBookingId: `serviceBookings/${serviceBookingKey}`,
		type: 'Tour',
		startDay: getTourStartDay(serviceBookingKey),
		SCUqty: 1
	};
}

function getLocalTransferDateInfo(serviceBookingKey) {
	return {
		serviceBookingKey: serviceBookingKey,
		serviceBookingId: `serviceBookings/${serviceBookingKey}`,
		type: 'Local Transfer',
		startDay: getTourStartDay(serviceBookingKey),
		SCUqty: 1
	};
}

function isLocalTransfer(serviceBookingKey) {
	let aqlQuery = `
	LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
	LET isLocalTransfer = FIRST(FOR serviceBooking IN 0..0 ANY serviceBookingId GRAPH 'exo-dev'
  		LET isLT = HAS(serviceBooking, 'serviceBookingType') && serviceBooking.serviceBookingType == 'localtransfer'
    	RETURN isLT)
	RETURN isLocalTransfer`;
	return db._query(aqlQuery, {
		serviceBookingKey: removeCollectionFromKey(serviceBookingKey)
	}).next();
}

function getAllServiceKeys(startNode) {
	const aqlQuery = `
	FOR serviceBookings, bookInEdge IN 1..2 OUTBOUND @startNode GRAPH 'exo-dev'
		FILTER !IS_NULL(serviceBookings) && IS_SAME_COLLECTION('serviceBookings', serviceBookings) && IS_SAME_COLLECTION('bookIn', bookInEdge)
		RETURN serviceBookings._key`;
	return db._query(aqlQuery, {
		startNode
	}).toArray();
}

// get all services for tripId, countryBookingId, cityBookingId, and other placementId
function getAllServiceKeys2(startNode) {
	if (!startNode) {
		return [];
	}
	// default outbound level
	let outBoundLevel = '';
	if (startNode.startsWith('trips/')) {
		outBoundLevel = '4..4';
	} else if (startNode.startsWith('countryBookings/')) {
		outBoundLevel = '3..3';
	} else if (startNode.startsWith('cityBookings/')) {
		outBoundLevel = '2..2';
	} else {
		outBoundLevel = '1..2';
	}

	let aqlQuery = `
	FOR serviceBookings, bookInEdge IN ${outBoundLevel} OUTBOUND @startNode GRAPH 'exo-dev'
		FILTER !IS_NULL(serviceBookings) && IS_SAME_COLLECTION('serviceBookings', serviceBookings) && IS_SAME_COLLECTION('bookIn', bookInEdge)
		RETURN serviceBookings._key`;

	return db._query(aqlQuery, {
		startNode
	}).toArray();
}

function getRoomConfigsAvailabilityXML(serviceId, roomConfigs, params, type) {
	const roomConfigsList = roomConfigs.map(function (roomConfig) {
		const emptyRoomConfig = (roomConfig._id && !hasPAX(roomConfig._id));
		const PAXS = getRoomConfigPaxList(serviceId, roomConfig);
		const paxCounts = getPaxCounts(serviceId, roomConfig);
		const paxList = PAXS.map(function (pax) {
			return pax;
		});
		return emptyRoomConfig ? ``
		: `<RoomConfig>
				${paxCounts}
				<RoomType>${roomConfig.roomType}</RoomType>
				<PaxList>
					${paxList.join('')}
				</PaxList>
			</RoomConfig>`;
	});
	const minimumAvailability = (type === 'Accommodation') ? '' : '<MinimumAvailability>OK</MinimumAvailability>';
	return `
		<?xml version="1.0"?><!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
  		<Request>
				<OptionInfoRequest>
        	<AgentID>${params.AgentID}</AgentID>
        	<Password>${params.Password}</Password>
        	<OptionNumber>${params.OptionNumber}</OptionNumber>
        	<Info>S</Info>
        	<DateFrom>${params.DateFrom}</DateFrom>
        	<SCUqty>${params.SCUqty}</SCUqty>
        	<RoomConfigs>
            ${roomConfigsList.join('')}
        	</RoomConfigs>
        	${minimumAvailability}
      	</OptionInfoRequest>
			</Request>`;
}

function getTourplanAvailabilityXML(serviceId, params, type) {
	let roomConfigs = getRoomConfigs(removeCollectionFromKey(serviceId));
	let roomConfigsXML = getRoomConfigsAvailabilityXML(serviceId, roomConfigs, params, type);
	return roomConfigsXML;
}

function addPromotion(resultArray, promotion) {
	if (promotion.Type) {
		let valueAddType = promotion.Type.Number;
		if (valueAddType >= 1 && valueAddType <= 6) {
			resultArray.push({
				type: valueAddType,
				description: promotion.Description.$t
			});
		}
	}
	return resultArray;
}

function addStayAndPay(stay, pay, promotions) {
	let promotion = {
		type: 'PayStay',
		description: `Stay ${stay} / Pay ${pay}`
	};
	promotions.push(promotion);
}

function addPromotions(tpDoc, valueAdds, resultTour) {
	let promotions = Array();
	if (valueAdds.length) {
		for (let i = 0; i < valueAdds.length; i++) {
			addPromotion(promotions, valueAdds[i].ValueAdd);
			// console.log(valueAdds[i].ValueAdd.Type.Number);
		}
	} else {
		addPromotion(promotions, valueAdds.ValueAdd);
	}
	if (promotions.length > 0) {
		resultTour.promotions = promotions;
	}
	if ((_.has(tpDoc, 'OptStayResults.Stay')) && (_.has(tpDoc, 'OptStayResults.Pay'))) {
		addStayAndPay(OptStayResults.Stay.$t, OptStayResults.Pay.$t, promotions);
	}
	resultTour.hasPromotions = promotions.length > 0;
}

function transformAvailableResult(tpDoc, countryCode) {
	let template = {
		content: {
			productId: {
				value: _.get(tpDoc, 'OptionNumber.$t').concat(countryCode),
				existsWhen: _.partialRight(_.has, 'OptionNumber.$t')
			},
			productOptCode: {
				value: _.get(tpDoc, 'Opt.$t'),
				existsWhen: _.partialRight(_.has, 'Opt.$t')
			},
			availability: {
				value: _.get(tpDoc, 'OptStayResults.Availability.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.Availability.$t')
			},
			currency: {
				value: _.get(tpDoc, 'OptStayResults.Currency.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.Currency.$t')
			},
			totalPrice: {
				value: Number(_.get(tpDoc, 'OptStayResults.TotalPrice.$t')),
				existsWhen: _.partialRight(_.has, 'OptStayResults.TotalPrice.$t')
			},
			commissionPercent: {
				value: Number(_.get(tpDoc, 'OptStayResults.CommissionPercent.$t')),
				existsWhen: _.partialRight(_.has, 'OptStayResults.CommissionPercent.$t')
			},
			agentPrice: {
				value: Number(_.get(tpDoc, 'OptStayResults.AgentPrice.$t')),
				existsWhen: _.partialRight(_.has, 'OptStayResults.AgentPrice.$t')
			},
			rateId: {
				value: _.get(tpDoc, 'OptStayResults.RateId.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.RateId.$t')
			},
			rateName: {
				value: _.get(tpDoc, 'OptStayResults.RateName.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.RateName.$t')
			},
			rateText: {
				value: _.get(tpDoc, 'OptStayResults.RateText.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.RateText.$t')
			},
			cancelHours: {
				value: Number(_.get(tpDoc, 'OptStayResults.CancelHours.$t')),
				existsWhen: _.partialRight(_.has, 'OptStayResults.CancelHours.$t')
			},
			dateFrom: {
				value: _.get(tpDoc, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.DateFrom.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.DateFrom.$t')
			},
			dateTo: {
				value: _.get(tpDoc, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.DateTo.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.DateTo.$t')
			}
		}
	};
	let result = j2j.run(template, tpDoc);
	if (_.has(tpDoc, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.ValueAdds')) {
		addPromotions(tpDoc, tpDoc.OptStayResults.PeriodValueAdds.PeriodValueAdd.ValueAdds, result);
	}
	return result;
}

function tourPlanCheckAvailability(tourplanServerUrl, params, type) {
	let result = {
		type: type,
		productId: params.OptionNumber + countryCodes[params.country.toLowerCase()],
		'availability': 'NO',
		requestXML: params.requestXML,
		serverURL: tourplanServerUrl
	};
	const tpReturn = request({
		method: 'post',
		url: tourplanServerUrl,
		body: params.requestXML,
		timeout: 120000
	});
	let xml = tpReturn.body;
	let json = XMLMapping.load(xml, {
		nested: true
	});
	if (_.has(json, 'Reply.OptionInfoReply.Option')) {
		result = transformAvailableResult(json.Reply.OptionInfoReply.Option, countryCodes[params.country.toLowerCase()]);
	}
	return result;
}

function availabilityCheck(serviceBookingId, params, type) {
	let tourplanServerUrl = servers[params.country.toLowerCase()];
	// if (isTransferPlacements(serviceBookingId) || isLocalTransfer(serviceBookingId)) {
	// 	tourplanServerUrl = servers[params.country.toLowerCase() + '_test_server'];
	// }
	let requestXML = getTourplanAvailabilityXML(serviceBookingId, params, type).replace(/(\r\n|\n|\r|\t)/gm, '');
	globalRequestXML = {
		XML: requestXML
	};
	Object.assign(params, params, {
		requestXML: requestXML
	});
	let tpResult = tourPlanCheckAvailability(tourplanServerUrl, params, type);
	return tpResult;
}

// get status state according to the availability Status
// used by the check availability api.
function getStateByTpAvailabilityStatus(availabilityStatus) {
	if (availabilityStatus === 'OK') {
		return 'Available';
	} else if (availabilityStatus === 'RQ') {
		return 'On Request';
	} else if (availabilityStatus === 'NO') {
		return 'Unavailable';
	} else {
		return null;
	}
}

// -- Interface --

_serviceBookings.checkServiceAvailability = checkServiceAvailability;

function checkServiceAvailability(serviceKey) {
	let result;
	if (hasPAX(`serviceBookings/${serviceKey}`)) {
		const serviceBookingInfo = getBookingInfo([serviceKey]);
		serviceBookingInfo.forEach((serviceBooking) => {
			const optionNumber = getOptionNumber(serviceBooking.serviceBookingKey);
			const params = {
				AgentID: 'uncircled',
				Password: 'kiril123',
				country: getCountry(serviceBooking.serviceBookingKey),
				OptionNumber: removeCountryCode(optionNumber),
				DateFrom: serviceBooking.startDay,
				SCUqty: serviceBooking.SCUqty
			};
			let serviceAvailabilityCheck = availabilityCheck(serviceBooking.serviceBookingId, params, serviceBooking.type);
			const patchData = {
				status: {
					tpAvailabilityStatus: serviceAvailabilityCheck.availability
				},
				price: {
					currency: serviceAvailabilityCheck.currency,
					rate: {
						name: serviceAvailabilityCheck.rateName,
						description: serviceAvailabilityCheck.rateText
					}
				},
				hasPromotion: serviceAvailabilityCheck.hasPromotions,
				dateFrom: serviceAvailabilityCheck.dateFrom,
				dateTo: serviceAvailabilityCheck.dateTo,
				cancelHours: serviceAvailabilityCheck.cancelHours,
				totalPrice: serviceAvailabilityCheck.totalPrice
			};
			// add amount only when the total price field is retruned back and is valid
			if (serviceAvailabilityCheck && serviceAvailabilityCheck.totalPrice && !isNaN(serviceAvailabilityCheck.totalPrice)) {
				patchData.price.amount = serviceAvailabilityCheck.totalPrice / 100;
			}
			const statusState = getStateByTpAvailabilityStatus(serviceAvailabilityCheck.availability);
			if (statusState) {
				patchData.status.state = statusState;
			}
			updateServiceBooking(serviceKey, patchData);
			result = getServiceBooking(serviceKey);
			// console.log(`Patch data: ${JSON.stringify(patchData)}`);
		});
		Object.assign(result, result, globalRequestXML);
		// console.log(`Servicebooking: ${JSON.stringify(result)}`);
	}
	return result;
}

_serviceBookings.checkServicesAvailability = checkServicesAvailability;

function checkServicesAvailability(id) {
	let result = [];
	const serviceKeys = getAllServiceKeys2(id);
	const serviceBookingInfo = getBookingInfo(serviceKeys);
	serviceBookingInfo.forEach((serviceBooking) => {
		if (hasPAX(`serviceBookings/${serviceBooking.serviceBookingKey}`)) {
			const optionNumber = getOptionNumber(serviceBooking.serviceBookingKey);
			const params = {
				AgentID: 'uncircled',
				Password: 'kiril123',
				country: getCountry(serviceBooking.serviceBookingKey),
				OptionNumber: removeCountryCode(optionNumber),
				DateFrom: serviceBooking.startDay,
				SCUqty: serviceBooking.SCUqty
			};
			let serviceAvailabilityCheck = availabilityCheck(serviceBooking.serviceBookingId, params, serviceBooking.type);
			const patchData = {
				status: {
					tpAvailabilityStatus: serviceAvailabilityCheck.availability
				},
				price: {
					currency: serviceAvailabilityCheck.currency,
					rate: {
						name: serviceAvailabilityCheck.rateName,
						description: serviceAvailabilityCheck.rateText
					}
				},
				hasPromotion: serviceAvailabilityCheck.hasPromotions,
				dateFrom: serviceAvailabilityCheck.dateFrom,
				dateTo: serviceAvailabilityCheck.dateTo,
				cancelHours: serviceAvailabilityCheck.cancelHours,
				totalPrice: serviceAvailabilityCheck.totalPrice
			};
			const statusState = getStateByTpAvailabilityStatus(serviceAvailabilityCheck.availability);
			if (statusState) {
				patchData.status.state = statusState;
			}
			updateServiceBooking(serviceBooking.serviceBookingKey, patchData);
			// console.log(`Patch data: ${JSON.stringify(patchData)}`);
			result.push(getServiceBooking(serviceBooking.serviceBookingKey));
		}
	});
	Object.assign(result, result, globalRequestXML);
	// console.log(`Servicebookings: ${JSON.stringify(result)}`);
	return result;
}

_serviceBookings.changeCityDaySlot = changeCityDaySlot;

function changeCityDaySlot(serviceBookingKey, newCityDayKey, startSlot) {
	let isPreselectedTour = isPreselected(serviceBookingKey);
	if (isPreselectedTour) {
		removePreselection(serviceBookingKey);
		addPreselection(serviceBookingKey, newCityDayKey, startSlot);
	}
	moveServiceBookingToCityDay(serviceBookingKey, newCityDayKey);
	updateServiceBookingStartSlot(serviceBookingKey, startSlot);
	let cityBookingId = getCityBookingId(serviceBookingKey);

	return cityBookingId;
}

_serviceBookings.getOptionNumber = getOptionNumber;

function getOptionNumber(serviceBookingKey) {
	let aqlQuery = `
	LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
	FOR productVertex IN 1..1 ANY serviceBookingId GRAPH 'exo-dev'
  		FILTER IS_SAME_COLLECTION('tours', productVertex) || IS_SAME_COLLECTION('transfers', productVertex) || IS_SAME_COLLECTION('accommodations', productVertex)
  		RETURN productVertex.productId`;
	return db._query(aqlQuery, {
		serviceBookingKey
	}).next();
}

_serviceBookings.getCountry = getCountry;

function getCountry(serviceBookingKey) {
	let aqlQuery = `
	LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
		FOR vertex, edges IN 3..3 any serviceBookingId GRAPH 'exo-dev'
    	FILTER IS_SAME_COLLECTION('countryBookings', vertex)
    	COLLECT countryBooking = vertex
    	RETURN countryBooking.countryCode`;
	return db._query(aqlQuery, {
		serviceBookingKey
	}).next();
}

_serviceBookings.getTripKey = getTripKey;

function getTripKey(serviceBookingKey) {
	let aqlQuery = `
  LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
	FOR vertex, edges IN 4..4 INBOUND serviceBookingId GRAPH 'exo-dev'
    FILTER IS_SAME_COLLECTION('trips', vertex)
    RETURN vertex._key`;
	return db._query(aqlQuery, {
		serviceBookingKey
	}).next();
}

_serviceBookings.getProposalKey = getProposalKey;

function getProposalKey(serviceBookingKey) {
	let aqlQuery = `
  LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
	FOR vertex, edges IN 5..5 INBOUND serviceBookingId GRAPH 'exo-dev'
    FILTER IS_SAME_COLLECTION('proposals', vertex)
    RETURN vertex._key`;
	return db._query(aqlQuery, {
		serviceBookingKey
	}).next();
}

_serviceBookings.getPaxList = getPaxList;

function getPaxList(serviceBookingKey) {
	let aqlQuery = `
	LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
	FOR vertex IN 1..1 OUTBOUND serviceBookingId GRAPH 'exo-dev'
    FILTER IS_SAME_COLLECTION('paxs', vertex)
    LET paxtype = SUBSTITUTE(vertex.ageGroup, ['adults', 'children', 'infants'], ['A', 'C', 'I'])
    RETURN {
        title: vertex.title,
        forename: vertex.firstName,
        surname: vertex.lastName,
        paxtype: paxtype
       }`;
	return db._query(aqlQuery, {
		serviceBookingKey
	}).toArray();
}

_serviceBookings.getCountryBookingKey = getCountryBookingKey;

function getCountryBookingKey(serviceBookingKey) {
	let aqlQuery = `
	LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
  FOR vertex IN 3..3 INBOUND serviceBookingId GRAPH 'exo-dev'
		FILTER IS_SAME_COLLECTION('countryBookings', vertex)
		RETURN vertex._id`;
	return db._qery(aqlQuery, {
		serviceBookingKey
	}).next();
}

_serviceBookings.getServiceBooking = getServiceBooking;

function getServiceBooking(serviceBookingKey) {
	let _serviceBookingKey = removeCollectionFromKey(serviceBookingKey);
	let aqlQuery = `
	LET objects = (FOR vertex, edge, path IN OUTBOUND CONCAT("serviceBookings/", @serviceBookingKey) use RETURN vertex)
	LET serviceBooking = DOCUMENT(CONCAT("serviceBookings/",@serviceBookingKey))
	LET theAccommodation = FIRST(
    FOR acc IN objects
    FOR accommodation IN accommodations
    FILTER acc._id == accommodation._id
    RETURN acc)
	LET theTour = FIRST(
    FOR aTour IN objects
    FOR tour IN tours
    FILTER aTour._id == tour._id
    RETURN aTour)
	LET theTransfer = FIRST(
		FOR aTransfer IN objects
		FOR transfer IN transfers
		FILTER aTransfer._id == transfer._id
		RETURN aTransfer)
	RETURN MERGE(serviceBooking, {accommodation: theAccommodation}, {tour: theTour}, {transfer: theTransfer})`;
	return db._query(aqlQuery, {
		'serviceBookingKey': _serviceBookingKey
	}).next();
}

_serviceBookings.removeServiceBooking = removeServiceBooking;

function removeServiceBooking(serviceBookingKey) {
	let serviceBooking = db.serviceBookings.document(serviceBookingKey);
	if (serviceBooking) {
		let aqlQuery = `
		FOR edge IN use
			FILTER edge._from == "${serviceBooking._id}"
		REMOVE edge IN use`;
		db._query(aqlQuery).toArray();
		aqlQuery =
			`FOR edge IN bookIn
		FILTER edge._to == "${serviceBooking._id}"
		REMOVE edge IN bookIn`;
		db._query(aqlQuery).toArray();
		this.remove(serviceBookingKey);
	}
}

_serviceBookings.removeServiceBookingFromTourPlan = removeServiceBookingFromTourPlan;

function removeServiceBookingFromTourPlan(params) {
	let aqlQuery = `
	LET tpBookingRef = FIRST(FOR countryBooking IN 3..3 INBOUND @serviceBookingId GRAPH 'exo-dev'
    	FILTER IS_SAME_COLLECTION('countryBookings', countryBooking)
    	RETURN countryBooking.tpBookingRef)

	LET serviceLineId = FIRST(FOR serviceBooking IN 0..0 ANY @serviceBookingId GRAPH 'exo-dev'
    	FILTER IS_SAME_COLLECTION('serviceBookings', serviceBooking)
    	RETURN serviceBooking.serviceLineId)

	RETURN {Ref:tpBookingRef, ServiceLineId:serviceLineId}`;

	let aqlResult = db._query(aqlQuery, {
		serviceBookingId: params.serviceBookingId
	}).next();
	// console.log(aqlResult);
	if (aqlResult.Ref && aqlResult.ServiceLineId) {
		params.Ref = aqlResult.Ref;
		params.ServiceLineId = aqlResult.ServiceLineId;
		let cancelServiceXML = getCancelSingleServiceBookingXML(params).replace(/(\r\n|\n|\r|\t)/gm, '');
		let tourPlanServerUrl = servers[params.country.toLowerCase()];
		// if (isTransferPlacements(params.serviceBookingId)) {
		// 	tourPlanServerUrl = servers[params.country.toLowerCase() + '_test_server'];
		// }
		let cancelBookingResult = cancelServiceBooking(tourPlanServerUrl, cancelServiceXML);
		let patchDataServiceBooking = {
			status: {
				tpBookingStatus: 'Unknown',
				state: 'Unknown'
			}
		};
		if (cancelBookingResult === 'XX') {
			patchDataServiceBooking = {
				status: {
					tpBookingStatus: 'XX',
					state: ''
				}
			};
		}
		updateServiceBooking(params.serviceBookingId, patchDataServiceBooking);
	}
	return getServiceBooking(params.serviceBookingId);
}

_serviceBookings.isTransfer = isTransfer;

function isTransfer(serviceBookingKey) {
	let _serviceBookingKey = removeCollectionFromKey(serviceBookingKey);
	let aqlQuery = `
	LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
  LET localTransfer = FIRST(FOR serviceBooking IN 0..0 INBOUND serviceBookingId GRAPH 'exo-dev' RETURN TRIM(LOWER(serviceBooking.serviceBookingType)) == "localtransfer")
	LET transfer = FIRST(FOR serviceBooking IN 1..1 INBOUND serviceBookingId GRAPH 'exo-dev' RETURN IS_SAME_COLLECTION('transferPlacements', serviceBooking))
  RETURN localTransfer || transfer`;
	return db._query(aqlQuery, {
		serviceBookingKey: _serviceBookingKey
	}).next();
}

_serviceBookings.isTransferPlacements = isTransferPlacements;

function isTransferPlacements(serviceBookingKey) {
	let _serviceBookingKey = removeCollectionFromKey(serviceBookingKey);
	let aqlQuery = `
	LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
 		FOR vertex, edges IN 1..1 INBOUND serviceBookingId GRAPH 'exo-dev'
    RETURN IS_SAME_COLLECTION('transferPlacements', vertex)`;
	return db._query(aqlQuery, {
		serviceBookingKey: _serviceBookingKey
	}).next();
}

_serviceBookings.isAccommodationPlacements = isAccommodationPlacements;

function isAccommodationPlacements(serviceBookingKey) {
	let _serviceBookingKey = removeCollectionFromKey(serviceBookingKey);
	let aqlQuery = `
	LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
    FOR vertex, edges IN 1..1 INBOUND serviceBookingId GRAPH 'exo-dev'
    RETURN IS_SAME_COLLECTION('accommodationPlacements', vertex)`;
	return db._query(aqlQuery, {
		serviceBookingKey: _serviceBookingKey
	}).next();
}

_serviceBookings.updateServiceBooking = updateServiceBooking;

function updateServiceBooking(serviceBookingKey, patchData) {
	let _serviceBookingKey = removeCollectionFromKey(serviceBookingKey);
	const result = db.serviceBookings.update(_serviceBookingKey, patchData, true);
	return result;
}

_serviceBookings.getBookingInfo = getBookingInfo;

function getBookingInfo(serviceBookingKeys) {
	let result = [];
	serviceBookingKeys.forEach((serviceBookingKey) => {
		if (isAccommodationPlacements(serviceBookingKey)) {
			let acc = getAccDateInfo(serviceBookingKey);
			result.push(acc);
		} else if (isTransferPlacements(serviceBookingKey)) {
			let trans = getTransferDateInfo(serviceBookingKey);
			result.push(trans);
		} else if (isLocalTransfer(serviceBookingKey)) {
			let localTransfer = getLocalTransferDateInfo(serviceBookingKey);
			result.push(localTransfer);
		} else {
			let tour = getTourDateInfo(serviceBookingKey);
			result.push(tour);
		}
	});
	return result;
}

_serviceBookings.checkPAXStatuses = checkPAXStatuses;

function checkPAXStatuses(tripKey, cityDayKey, serviceBookingKey) {
	let {
		tripPaxList,
		tripStrtDate
	} = getTripPaxList(tripKey);
	tripPaxList.map((pax) => calculatePaxAgeGroup(pax, tripStrtDate));
	let serviceBooking = db.serviceBookings.document(serviceBookingKey);
	let allOtherServiceBookings = getAllOtherServiceBookings(cityDayKey, serviceBooking._id);
	let overlaps = getOverlappingServiceBookings(serviceBooking, allOtherServiceBookings);
	let result = [];
	if (overlaps.length > 0) {
		overlaps.push(serviceBooking);
		result = checkPAX(tripPaxList, overlaps);
	} else {
		result = checkPAX(tripPaxList, [serviceBooking]);
	}

	return result;
}

_serviceBookings.bookServiceBookingToTourPlan = bookServiceBookingToTourPlan;

function bookServiceBookingToTourPlan(serviceBookingKey, params) {
	let requestXML = '';
	let tpResult = '';
	if (hasPAX('serviceBookings/' + serviceBookingKey)) {
		// addSCUqty(serviceBookingKey, params);
		addLeadPax(serviceBookingKey, params);
		// addIsTransfer(serviceBookingKey, params);
		let tourPlanServerUrl = servers[params.country.toLowerCase()];
		// if (isTransferPlacements(serviceBookingKey)) {
		// 	tourPlanServerUrl = servers[params.country.toLowerCase() + '_test_server'];
		// }
		const countryBooking = getCountryBookingX(serviceBookingKey);
		if (countryBooking) {
			if (isBooked(countryBooking._id)) {
				// console.log('isbooked', countryBooking._id);
				params.Ref = countryBooking.tpBookingRef;
				requestXML = getTourplanBookingXML(serviceBookingKey, params).replace(/(\r\n|\n|\r|\t)/gm, '');
				Object.assign(params, params, {
					requestXML: requestXML
				});
				tpResult = tourplanBooking(tourPlanServerUrl, params, countryBooking._id, serviceBookingKey, false);
			} else {
				// console.log('is not booked', countryBooking._id, isTransferPlacements(serviceBookingKey));
				requestXML = getTourplanBookingXML(serviceBookingKey, params).replace(/(\r\n|\n|\r|\t)/gm, '');
				Object.assign(params, params, {
					requestXML: requestXML
				});
				tpResult = tourplanBooking(tourPlanServerUrl, params, countryBooking._id, serviceBookingKey, true);
			}
		}
	}
	// return params;
	return getServiceBooking(serviceBookingKey);
}

_serviceBookings.newTourplanBookingX = tourplanBooking;

function tourplanBooking(tourplanServerUrl, params, countryBookingKey, serviceBookingKey, isNew) {
	let result = {
		status: 'Error',
		message: 'New Tourplan booking Error'
	};
	const tpReturn = request({
		method: 'post',
		url: tourplanServerUrl,
		body: params.requestXML,
		timeout: 120000
	});
	let json = XMLMapping.load(tpReturn.body);
	//console.log(`XML: ${params.requestXML}, CountryBookingKey: ${countryBookingKey}, ServiceBookingKey: ${serviceBookingKey}, result: ${JSON.stringify(json)}`);
	if (json.Reply.AddServiceReply) {
		let status = json.Reply.AddServiceReply.Status.$t;
		//console.log(status);
		let patchDataServiceBooking = {
			status: {
				tpBookingStatus: 'Unknown',
				state: 'Unknown'
			}
		};
		if (status === 'OK') {
			if (isNew) {
				let patchDataCountryBooking = {
					tpBookingId: Number(json.Reply.AddServiceReply.BookingId.$t),
					tpBookingRef: json.Reply.AddServiceReply.Ref.$t
				};
				patchCountryBooking(countryBookingKey, patchDataCountryBooking);
			}
			patchDataServiceBooking = {
				serviceLineId: Number(json.Reply.AddServiceReply.ServiceLineId.$t),
				serviceSequenceNumber: Number(json.Reply.AddServiceReply.SequenceNumber.$t),
				status: {
					tpBookingStatus: status,
					state: 'Booked'
				}
			};
			patchServiceBooking(serviceBookingKey, patchDataServiceBooking);
			result = {
				status: patchDataServiceBooking.status.tpBookingStatus,
				message: patchDataServiceBooking.status.state
			};
		} else {
			switch (status) {
				case 'NO':
					patchDataServiceBooking = {
						status: {
							tpBookingStatus: status,
							state: 'Declined'
						}
					};
					break;
				case 'RQ': {
					if (isNew) {
						let patchDataCountryBooking = {
							tpBookingId: Number(json.Reply.AddServiceReply.BookingId.$t),
							tpBookingRef: json.Reply.AddServiceReply.Ref.$t
						};
						patchCountryBooking(countryBookingKey, patchDataCountryBooking);
					}
					patchDataServiceBooking =
						setServiceBookingOnRequest(
							tourplanServerUrl,
							serviceBookingKey,
							json.Reply.AddServiceReply.ServiceLineId.$t,
							json.Reply.AddServiceReply.SequenceNumber.$t,
							status,
							'On Request'
						);
				}
					break;
				case 'XX':
					patchDataServiceBooking = {
						status: {
							tpBookingStatus: status,
							state: 'Cancelled'
						}
					};
					break;
				default:
					patchDataServiceBooking = {
						status: {
							tpBookingStatus: status,
							state: 'Unknown status'
						}
					};
					break;
			}
			patchServiceBooking(serviceBookingKey, patchDataServiceBooking);
			result = {
				status: patchDataServiceBooking.status.tpBookingStatus,
				message: patchDataServiceBooking.status.state
			};
		}
	} else {
		result = {
			status: 'Error',
			message: json.Reply.ErrorReply.Error.$t
		};
	}
	return Object.assign(result, result, {
		servicebookingKey: serviceBookingKey
	});
}

/*
_serviceBookings.newTourplanBooking = newTourplanBooking;

function newTourplanBooking(tourplanServerUrl, params, paxlist, countryBookingKey, serviceBookingKey) {
	let result = {};
	let requestXML = getTourPlanNewBookingXML(params, paxlist);
	let tpReturn = request({
		method: 'post',
		url: tourplanServerUrl,
		body: requestXML,
		timeout: 120000
	});
	let json = XMLMapping.load(tpReturn.body);
	if (json.Reply.AddServiceReply) {
		let status = json.Reply.AddServiceReply.Status.$t;
		let patchDataServiceBooking = {
			status: {
				tpBookingStatus: 'Unknown',
				state: 'Unknown'
			}
		};
		if (status === 'OK') {
			let patchDataCountryBooking = {
				tpBookingId: Number(json.Reply.AddServiceReply.BookingId.$t),
				tpBookingRef: json.Reply.AddServiceReply.Ref.$t
			};
			patchDataServiceBooking = {
				serviceLineId: Number(json.Reply.AddServiceReply.ServiceLineId.$t),
				serviceSequenceNumber: Number(json.Reply.AddServiceReply.SequenceNumber.$t),
				status: {
					tpBookingStatus: status,
					state: 'Booked'
				}
			};
			patchCountryBooking(countryBookingKey, patchDataCountryBooking);
			patchServiceBooking(serviceBookingKey, patchDataServiceBooking);
			result = {
				status: patchDataServiceBooking.status.tpBookingStatus,
				message: patchDataServiceBooking.status.state
			};
		} else {
			switch (status) {
				case 'NO':
					patchDataServiceBooking = {
						status: {
							tpBookingStatus: status,
							state: 'Declined'
						}
					};
					break;
				case 'RQ':
					patchDataServiceBooking = {
						status: {
							tpBookingStatus: status,
							state: 'On Request'
						}
					};
					break;
				case 'XX':
					patchDataServiceBooking = {
						status: {
							tpBookingStatus: status,
							state: 'Cancelled'
						}
					};
					break;
				default:
					patchDataServiceBooking = {
						status: {
							tpBookingStatus: status,
							state: 'Unknown status'
						}
					};
					break;
			}
			patchServiceBooking(serviceBookingKey, patchDataServiceBooking);
			result = {
				status: patchDataServiceBooking.status.tpBookingStatus,
				message: patchDataServiceBooking.status.state
			};
		}

	} else {
		result = {
			status: 'Error',
			message: json.Reply.ErrorReply.Error.$t
		};
	}
	return result;
}

_serviceBookings.updateTourplanBooking = updateTourplanBooking;

function updateTourplanBooking(tourplanServerUrl, params, paxlist, serviceBookingKey) {
	console.log('updateTourplanBooking');
	let result = {};
	let requestXML = getTourplanUpdateBooking(params, paxlist);
	console.log('Post');
	let tpReturn = request({
		method: 'post',
		url: tourplanServerUrl,
		body: requestXML,
		timeout: 120000
	});
	let xml = tpReturn.body;
	console.log('XMLMapping');
	let json = XMLMapping.load(xml);

	if (json.Reply.AddServiceReply) {
		let status = json.Reply.AddServiceReply.Status.$t;
		let patchDataServiceBooking = {
			status: {
				tpBookingStatus: 'Unknown',
				state: 'Unknown'
			}
		};
		if (status === 'OK') {
			patchDataServiceBooking = {
				serviceLineId: Number(json.Reply.AddServiceReply.ServiceLineId.$t),
				serviceSequenceNumber: Number(json.Reply.AddServiceReply.SequenceNumber.$t),
				status: {
					tpBookingStatus: status,
					state: 'Booked'
				}
			};
			console.log('patchServiceBooking');
			console.log(patchServiceBooking(serviceBookingKey, patchDataServiceBooking));
			result = {
				status: patchDataServiceBooking.status.tpBookingStatus,
				message: patchDataServiceBooking.status.state
			};
		} else {
			switch (status) {
				case 'NO':
					patchDataServiceBooking = {
						status: {
							tpBookingStatus: status,
							state: 'Declined'
						}
					};
					break;
				case 'RQ':
					patchDataServiceBooking = {
						status: {
							tpBookingStatus: status,
							state: 'On Request'
						}
					};
					break;
				case 'XX':
					patchDataServiceBooking = {
						status: {
							tpBookingStatus: status,
							state: 'Cancelled'
						}
					};
					break;
				default:
					patchDataServiceBooking = {
						status: {
							tpBookingStatus: status,
							state: 'Unknown status'
						}
					};
					break;
			}
			console.log('patchServiceBooking');
			patchServiceBooking(serviceBookingKey, patchDataServiceBooking);
			result = {
				status: patchDataServiceBooking.status.tpBookingStatus,
				message: patchDataServiceBooking.status.state
			};
		}

	} else {
		result = {
			status: 'Error',
			message: json.Reply.ErrorReply.Error.$t
		};
	}
	return result;
}*/
