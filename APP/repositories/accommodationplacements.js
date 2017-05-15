'use strict';
const db = require("@arangodb").db;
const request = require('@arangodb/request');
const XMLMapping = require('xml-mapping');
const _ = require('lodash');
const removeCollectionFromKey = require('../utils').removeCollectionFromKey;
const getServerUrlFromId = require('../utils/serversAndCountries').getServerUrlFromId;
const getRatesXML = require('../utils/tpXMLScripts').getRatesXML;
const getPromotionsXML = require('../utils/tpXMLScripts').getPromotionsXML;
const getArrayDiff = require('../utils').getArrayDiff;

const Trip = require('../repositories/trips').getTrip;

const _cityBookings = require('./citybookings');

const _accomodationPlacements = db._collection('accommodationPlacements');
module.exports = _accomodationPlacements;

function adjustCityDays(cityBookingKey, durationNights, startDay) {
	let cityBookingId = 'cityBookings/';
	cityBookingId = cityBookingId.concat(cityBookingKey);
	let aqlQueryCityDaysCount = `
	FOR cityBooking IN cityBookings
		FILTER cityBooking._id == @cityBookingId
		RETURN LENGTH(cityBooking.dayOrder)`;
	let cityDaysCount = db._query(aqlQueryCityDaysCount, {'cityBookingId': cityBookingId}).toArray()[0];
	let durationDays = durationNights + 1;
	console.log('durationDays', durationDays, 'cityDaysCount', cityDaysCount);
	for (let i=cityDaysCount; i<durationDays; i++) {
		console.log('day added', i);
		_cityBookings.addCityDay(cityBookingKey, i, {});
	}
}

function getOptCodes(selectedAccommodationKeys) {
	let aqlQuery = `
	FOR accommodationKey IN @selectedAccommodationKeys
    FOR accommodation IN accommodations
    FILTER accommodation._key == accommodationKey
    RETURN {optCode: accommodation.productOptCode, accommodationKey: accommodationKey}`;
	return db._query(aqlQuery, {'selectedAccommodationKeys': selectedAccommodationKeys}).toArray();
}

function getRates(optCodes, dateFrom) {
	let result = [];
	for (let i=0; i<optCodes.length; i++) {
		let accommodationKey = optCodes[i].accommodationKey;
		let tourplanServerUrl = getServerUrlFromId(accommodationKey);
		let optCode = optCodes[i].optCode;
		result.push(getRatesFromTourplan(tourplanServerUrl, optCode, dateFrom, accommodationKey));
	}
	return result;
}

function getPromotions(optCodes, dateFrom) {
	let result = [];
	for (let i=0; i<optCodes.length; i++) {
		let accommodationKey = optCodes[i].accommodationKey;
		let tourplanServerUrl = getServerUrlFromId(accommodationKey);
		let optCode = optCodes[i].optCode;
		let promotions = getPromotionsFromTourplan(tourplanServerUrl, optCode, dateFrom, accommodationKey);
		if (promotions.length>0) {
			result.push(promotions);
		}
	}
	return result;
}

function getRatesFromTourplan(serverUrl, optCode, dateFrom, accommodationKey) {
	const result = {
		RateName: '',
		RateDescription: '',
		accommodationKey: accommodationKey
	};
	let requestXML = getRatesXML({optCode: optCode, dateFrom: dateFrom});
	let tpReturn = request({
		method: 'post',
		url: serverUrl,
		body: requestXML,
		timeout: 120000
	});
	let xml = tpReturn.body;
	let json = XMLMapping.load(xml, {nested: true});

	if (_.has(json, 'Reply.OptionInfoReply.Option.OptRates.OptRate.RateName')) {
		Object.assign(result, result, {RateName: json.Reply.OptionInfoReply.Option.OptRates.OptRate.RateName.$t});
	}

	if (_.has(json, 'Reply.OptionInfoReply.Option.OptRates.OptRate.RateText')) {
		Object.assign(result, result, {RateName: json.Reply.OptionInfoReply.Option.OptRates.OptRate.RateText.$t});
	}

	return result;
	// return {RateName: json.Reply.OptionInfoReply.Option.OptRates.OptRate.RateName.$t,
	// 	RateDescription: json.Reply.OptionInfoReply.Option.OptRates.OptRate.RateText.$t,
	// 	accommodationKey: accommodationKey};
}

function getPromotionsFromTourplan(serverUrl, optCode, dateFrom, accommodationKey) {
	let requestXML = getPromotionsXML({optCode: optCode, dateFrom: dateFrom});
	let tpReturn = request({
		method: 'post',
		url: serverUrl,
		body: requestXML,
		timeout: 120000
	});
	let xml = tpReturn.body;
	let json = XMLMapping.load(xml, {nested: true});
	let promotionTypes = ["1", "2", "3", "4", "5", "6"];
	let valueAdd = [];
	if (_.has(json, 'Reply.OptionInfoReply.Option.OptRates.OptRate.ValueAdds.ValueAdd')) {
		valueAdd = json.Reply.OptionInfoReply.Option.OptRates.OptRate.ValueAdds.ValueAdd;
	}
	let result = [];
	if (valueAdd.length) { // Array
		for (let i=0; i<valueAdd.length; i++) {
			let type = valueAdd[i].Type.Number;
			if (promotionTypes.indexOf(type)!==-1) {
				result.push({
					type: valueAdd[i].Type.$t,
					description: valueAdd[i].Description.$t,
					accommodationKey: accommodationKey
				});
			}
		}
	} else if (valueAdd.lenth > 0) { // Single object
		let type = valueAdd.Type.Number;
			if (promotionTypes.indexOf(type)!==-1) {
				result.push({
					type: valueAdd.Type.$t,
					description: valueAdd.Description.$t,
					accommodationKey: accommodationKey
				});
			}
	}
	return result;
}

function createAccommodationPlacement(durationNights, startDay, startDate) {
	return db.accommodationPlacements.save({durationNights: durationNights, startDay: startDay, startDate:startDate});
}

function savePlaceholders(newPlaceholdersObjects, accommodationPlacementId) {
	let aqlQuery = `
	LET newPlaceholders = (
    FOR placeholder IN @placeholders
        INSERT { placeholder: {title: placeholder.title},notes: placeholder.notes} IN serviceBookings
    RETURN NEW)
    FOR serviceBooking IN newPlaceholders
        INSERT {_from:@accommodationPlacementId, _to:serviceBooking._id, label: "placeholder"} IN bookIn
        RETURN NEW`;
	return db._query(aqlQuery, {'placeholders': newPlaceholdersObjects, 'accommodationPlacementId': accommodationPlacementId}).toArray();
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

function getPlaceholders(accommodationPlacementId) {
	let aqlQuery = `
	LET services = (FOR vertex, edge IN OUTBOUND @accommodationPlacementId bookIn RETURN edge)
	FOR service IN services
    FILTER service.label == 'placeholder'
    FOR serviceBooking IN serviceBookings
        FILTER serviceBooking._id == service._to
  	RETURN {serviceBookingKey: serviceBooking._key}`;
	return db._query(aqlQuery, {'accommodationPlacementId': accommodationPlacementId}).toArray();
}

function deletePlaceholders(newPlaceholders) {
	let aqlQuery = `
	LET oldPlaceholders = (
    FOR placeholder IN @placeholders
        LET placeholderId = CONCAT("serviceBookings/", placeholder.serviceBookingKey)
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
	return db._query(aqlQuery, {'placeholders': newPlaceholders}).toArray();
}

function removeAccommodationPlacement(accommodationPlacementId) {
	let aqlQuery = `
	LET bookInEdges = (FOR vertex, edge IN INBOUND @accommodationPlacementId bookIn RETURN edge)
	LET removeEdges = (
    FOR edge IN bookInEdges
      REMOVE edge IN bookIn)
      FOR accommodationPlacement IN accommodationPlacements
        FILTER accommodationPlacement._id == @accommodationPlacementId
        REMOVE accommodationPlacement IN accommodationPlacements
        RETURN OLD`;
	return db._query(aqlQuery, {'accommodationPlacementId': accommodationPlacementId}).toArray();
}

function updatePreselectedAccommodations(accommodationPlacementId, preselections) {
	let aqlQuery = `
		FOR accommodation IN @preselections
		LET accommodationId = CONCAT("accommodations/",accommodation)
			UPSERT {"_from":@accommodationPlacementId, "_to":accommodationId}
			INSERT {"_from":@accommodationPlacementId, "_to":accommodationId}
			UPDATE {}
			IN preselect
			RETURN NEW`;
	return db._query(aqlQuery, {'preselections': preselections, 'accommodationPlacementId': accommodationPlacementId});
}

function updateAccommodationPlacementBookIn(accommodationPlacementId, cityBookingKey) {
	let aqlQuery = `
	LET cityBookingId = CONCAT("cityBookings/", @cityBookingKey)
		UPSERT {"_from":cityBookingId, "_to":@accommodationPlacementId, "label": "BookIn"}
  	INSERT {"_from":cityBookingId, "_to":@accommodationPlacementId, "label": "BookIn"}
  	UPDATE {}
  	IN bookIn
		RETURN NEW`;
	return db._query(aqlQuery, {'accommodationPlacementId': accommodationPlacementId, 'cityBookingKey': cityBookingKey}).toArray();
}

function createServiceBookings(selectedAccommodations) {
	let dateFrom = '2016-10-10';
	let optCodes = getOptCodes(selectedAccommodations);
	let rates = getRates(optCodes, dateFrom);
	let promotions = getPromotions(optCodes, dateFrom);
	let aqlQuery = `
	LET newServiceBookings = (
  FOR selectedAccommodation IN @selectedAccommodations
  LET accommodationId = CONCAT("accommodations/", selectedAccommodation)
    FOR accommodation IN accommodations
        FILTER accommodation._id == accommodationId
    	RETURN MERGE(accommodation,
    	{rate: (FOR rate IN @rates FILTER rate.accommodationKey == accommodation._key RETURN {name: rate.RateName, description: rate.RateDescription})},
    	{promotions: (FOR promotion IN @promotions FILTER promotion.accommodationKey == accommodation._key RETURN {type: promotion.type, description: promotion.description})}))
    FOR newBooking IN newServiceBookings
    INSERT { productId: newBooking.productId, rate: FIRST(newBooking.rate), promotions: newBooking.promotion} IN serviceBookings
    RETURN NEW._id`;
	return db._query(aqlQuery, {'selectedAccommodations': selectedAccommodations, 'rates': rates, 'promotions': promotions}).toArray();
}


function createAccommodationEdges(serviceBookings, accommodationPlacementId) {
	let aqlQuery = `
	FOR serviceBookingId IN @serviceBookings
		UPSERT {"_from":@accommodationPlacementId, "_to":serviceBookingId, "label": "BookIn"}
  	INSERT {"_from":@accommodationPlacementId, "_to":serviceBookingId, "label": "BookIn"}
  	UPDATE {}
  	IN bookIn
		RETURN NEW`;
	return db._query(aqlQuery, {'serviceBookings': serviceBookings, 'accommodationPlacementId': accommodationPlacementId}).toArray();
}

function createUseAccommodationEdges(serviceBookings, selectedAccommodationKeys) {
	let aqlQuery = `
	FOR selectedAccommodation IN @selectedAccommodationKeys
    LET accommodationId = CONCAT("accommodations/", selectedAccommodation)
  	FOR accommodation IN accommodations
    	FILTER accommodation._id == accommodationId
    	FOR serviceBooking IN serviceBookings
    	    FOR service IN @serviceBookings
    	    FILTER (accommodation.productId == serviceBooking.productId) && (service == serviceBooking._id)
    	    	UPSERT {"_from":serviceBooking._id, "_to":accommodation._id}
						INSERT {"_from":serviceBooking._id, "_to":accommodation._id}
						UPDATE {}
						IN use
						RETURN NEW`;
	return db._query(aqlQuery, {'selectedAccommodationKeys': selectedAccommodationKeys, 'serviceBookings': serviceBookings}).toArray();
}

function createUseSupplierEdges(accommodationPlacementId, selectedAccommodationKeys) {
	function removePreviousEdges(accommodationPlacementId) {
		let aqlQuery = `
		LET accommodationPlacementEdges = (FOR vertex, edge IN OUTBOUND @accommodationPlacementId use RETURN edge)
		FOR accommodationPlacement IN accommodationPlacementEdges
			REMOVE accommodationPlacement IN use`;
		db._query(aqlQuery, {"accommodationPlacementId": accommodationPlacementId}).toArray();
	}
	let aqlQuery = `
  FOR selectedAccommodation IN @selectedAccommodationKeys
    LET accommodationId = CONCAT("accommodations/", selectedAccommodation)
    LET supplyEdges = (FOR vertex, edge IN INBOUND accommodationId supply RETURN edge)
    FOR supplyEdge IN supplyEdges
      COLLECT supplierId = supplyEdge._from
      UPSERT {_from:@accommodationPlacementId, _to:supplierId}
      INSERT {_from:@accommodationPlacementId, _to:supplierId}
      UPDATE {}
      IN use
      RETURN NEW`;
	removePreviousEdges(accommodationPlacementId);
	return db._query(aqlQuery, {"accommodationPlacementId": accommodationPlacementId, "selectedAccommodationKeys": selectedAccommodationKeys}).toArray();
}

function getAccommodations(cityBookingKey) {
	return _cityBookings.getServiceBookings(cityBookingKey);
}

function updateAccomodationPlacement(accommodationPlacementId, durationNights, startDay, startDate) {
	let aqlQuery = `
	FOR accommodationPlacement IN accommodationPlacements
    FILTER accommodationPlacement._id == @accommodationPlacementId
        UPDATE accommodationPlacement WITH {"durationNights": @durationNights, "startDay": @startDay, "startDate": @startDate} IN accommodationPlacements
        RETURN NEW`;
	return db._query(aqlQuery, {'accommodationPlacementId': accommodationPlacementId, 'durationNights': durationNights, 'startDay': startDay, 'startDate': startDate}).next();
}

function numberOfPreselections(accommodationPlacementId) {
	let aqlQuery = `
	LET preselections = (FOR vertex, edge IN OUTBOUND @accommodationPlacementId preselect RETURN edge)
		RETURN {preselections: LENGTH(preselections)}`;
	return db._query(aqlQuery, {'accommodationPlacementId': accommodationPlacementId}).next();
}

function getSelectedUpdates(accommodationPlacementId, newSelectedAccommodationKeys) {
	let aqlQuery = `
	LET accommodationPlacementIds = (FOR vertex, edge IN OUTBOUND @accommodationPlacementId bookIn RETURN edge)
	LET previous = (FOR serviceBookingId IN accommodationPlacementIds
    FOR serviceBooking IN serviceBookings
        FILTER serviceBooking._id == serviceBookingId._to
        LET accommodationIds = (FOR vertex, edge IN OUTBOUND serviceBooking._id use RETURN edge)
     	    FOR accommodationId IN accommodationIds
        	    FOR accommodation IN accommodations
          	    FILTER accommodation._id == accommodationId._to
                RETURN accommodation._key)
	LET new = @newSelectedAccommodationKeys
	RETURN {toDelete: MINUS(previous, new), toCreate: MINUS(new, previous)}`;
	return db._query(aqlQuery, {'accommodationPlacementId': accommodationPlacementId, 'newSelectedAccommodationKeys': newSelectedAccommodationKeys}).next();
}

function getSelectedUpdatesPlaceholders(accommodationPlacementId) {
	let aqlQuery = `
	LET accommodationPlacementIds = (FOR vertex, edge IN OUTBOUND @accommodationPlacementId bookIn RETURN edge)
	LET previous = (
	    FOR serviceBookingId IN accommodationPlacementIds
        FOR serviceBooking IN serviceBookings
            FILTER serviceBooking._id == serviceBookingId._to && serviceBooking.placeholder
            RETURN serviceBooking._key)
	LET new = @newSelectedAccommodationKeys
	RETURN {toDelete: MINUS(previous, new), toCreate: MINUS(new, previous)}`;
	return db._query(aqlQuery, {"accommodationPlacementId": accommodationPlacementId, "newSelectedAccommodationKeys": []}).toArray();
}

function getPreselectedUpdates(accommodationPlacementId, newPreselectedAccommodationKeys, newSelectedAccommodationKeys) {
	let aqlQuery = `
 	LET preselections = (FOR vertex, edge IN OUTBOUND @accommodationPlacementId preselect RETURN edge)
	LET previous = (FOR preselect IN preselections
	  FOR accommodation IN accommodations
	  	FILTER accommodation._id == preselect._to
  		RETURN accommodation._key)
  LET new = UNIQUE(UNION(@newPreselectedAccommodationKeys, @newSelectedAccommodationKeys))
	RETURN {toDelete: MINUS(previous, new), toCreate: MINUS(new, previous)}`;
	return db._query(aqlQuery, {'accommodationPlacementId': accommodationPlacementId,
		'newPreselectedAccommodationKeys': newPreselectedAccommodationKeys,
		'newSelectedAccommodationKeys': newSelectedAccommodationKeys}).next();
}

function getServiceBookingToDelete(accommodationPlacementId, toDelete) {
	let aqlQuery = `
	LET accommodationPlacementService = (FOR vertex, edge IN OUTBOUND @accommodationPlacementId bookIn RETURN edge)
 	FOR accommodationPlacement IN @toDelete
 		LET accService = (FOR vertex, edge IN INBOUND CONCAT('accommodations/', accommodationPlacement) use RETURN edge)
 		FOR sup IN accommodationPlacementService
 			FOR accom IN accService
 			FILTER sup._to == accom._from
 			RETURN accom._from`;
	return db._query(aqlQuery, {'accommodationPlacementId': accommodationPlacementId, 'toDelete': toDelete}).toArray();
}

function removeUseEdges(serviceBookings) {
	let aqlQuery = `
	FOR serviceBookingId IN @serviceBookings
  	LET useEdge = (FOR vertex, edge IN OUTBOUND serviceBookingId use RETURN edge)
  	FOR edge IN useEdge
    	REMOVE edge IN use`;
	return db._query(aqlQuery, {'serviceBookings': serviceBookings}).toArray();
}

function removeBookInEdges(serviceBookings) {
	let aqlQuery = `
	FOR serviceBookingId IN @serviceBookings
  LET bookInEdge = (FOR vertex, edge IN INBOUND serviceBookingId bookIn RETURN edge)
  FOR edge IN bookInEdge
  REMOVE edge IN bookIn`;
	return db._query(aqlQuery, {'serviceBookings': serviceBookings}).toArray();
}

function removeServiceBookings(accommodationPlacementId, toDelete) {
	let serviceBookings = getServiceBookingToDelete(accommodationPlacementId, toDelete);
	removeUseEdges(serviceBookings);
	removeBookInEdges(serviceBookings);
	let aqlQuery = `
	FOR serviceBookingId IN @serviceBookings
    FOR serviceBooking IN serviceBookings
        FILTER serviceBooking._id == serviceBookingId
        REMOVE serviceBooking IN serviceBookings`;
	return db._query(aqlQuery, {'serviceBookings': serviceBookings}).toArray();
}

// mark the to delete services as inactive
function markServiceBookingsIsInactive(accommodationPlacementId, serviceBookingIds, inactive) {
  let aqlQuery = `
  let accommodationBookInEdges = (FOR vertex, edge IN OUTBOUND @accommodationPlacementId bookIn RETURN edge)
  FOR serviceBookingId IN @serviceBookingIds
    FOR edge IN accommodationBookInEdges
      FILTER edge._to == serviceBookingId
      UPDATE edge WITH {'inactive': @inactive} IN bookIn`;
  return db._query(aqlQuery, {
    'accommodationPlacementId': accommodationPlacementId,
    'serviceBookingIds': serviceBookingIds,
    'inactive': inactive}).toArray();
}

function removePlaceholderServiceBookings(toDelete) {
	if (toDelete) {
		for (let i = 0; i < toDelete.length; i++) {
			toDelete[i] = "serviceBookings/" + toDelete[i];
		}
		removeBookInEdges(toDelete);
		let aqlQuery = `
  		FOR serviceBookingId IN @serviceBookings
  		FOR serviceBooking IN serviceBookings
  			FILTER serviceBooking._id == serviceBookingId
  			REMOVE serviceBooking IN serviceBookings`;
		return db._query(aqlQuery, {'serviceBookings': toDelete}).toArray();
	}
}

function deletePreselections(accommodationPlacementId, toDelete) {
	let aqlQuery = `
	LET preselections = (FOR vertex, edge IN OUTBOUND @accommodationPlacementId preselect RETURN edge)
	FOR accommodationKey IN @toDelete
		LET accommodationId = CONCAT('accommodations/', accommodationKey)
		FOR preselected IN preselections
			FILTER preselected._to == accommodationId
			REMOVE preselected IN preselect`;
	return db._query(aqlQuery, {'accommodationPlacementId': accommodationPlacementId, 'toDelete': toDelete}).toArray();
}

function addNewAccommodationPlacement(cityBookingKey, durationNights, startDay, preselectedAccommodationKeys,
																			selectedAccommodationKeys, newPlaceholders, startDate) {
	let accommodationPlacement = createAccommodationPlacement(durationNights, startDay, startDate );
	updatePreselectedAccommodations(accommodationPlacement._id, preselectedAccommodationKeys);
	updatePreselectedAccommodations(accommodationPlacement._id, selectedAccommodationKeys);
	let serviceBookings = createServiceBookings(selectedAccommodationKeys);
	createAccommodationEdges(serviceBookings, accommodationPlacement._id);
	createUseAccommodationEdges(serviceBookings, selectedAccommodationKeys);
	createUseSupplierEdges(accommodationPlacement._id, selectedAccommodationKeys);
	updateAccommodationPlacementBookIn(accommodationPlacement._id, cityBookingKey);
	let newPlaceholdersObjects = getNewPlaceholdersObjects(newPlaceholders);
	savePlaceholders(newPlaceholdersObjects, accommodationPlacement._id);
	adjustCityDays(cityBookingKey, durationNights, startDay);
	let accommodations = getAccommodations(cityBookingKey);
	accommodations.preselections = numberOfPreselections(accommodationPlacement._id).preselections;
	return accommodations;
}

function patchAccommodationPlacement(cityBookingKey, accommodationPlacementKey, durationNights, startDay, selectedAccommodationKeys, preselectedAccommodationKeys, newPlaceholders, startDate) {
	accommodationPlacementKey = removeCollectionFromKey(accommodationPlacementKey);
	let accommodationPlacementId = 'accommodationPlacements/' + accommodationPlacementKey;
	let accommodationPlacement = db.accommodationPlacements.document(accommodationPlacementKey);
	if (accommodationPlacement) {
		updateAccomodationPlacement(accommodationPlacementId, durationNights, startDay, startDate);
		let selectedUpdates = getSelectedUpdates(accommodationPlacementId, selectedAccommodationKeys);
		removeServiceBookings(accommodationPlacementId, selectedUpdates.toDelete);
		let serviceBookings = createServiceBookings(selectedUpdates.toCreate);
		createAccommodationEdges(serviceBookings, accommodationPlacement._id);
		createUseAccommodationEdges(serviceBookings, selectedUpdates.toCreate);
		createUseSupplierEdges(accommodationPlacement._id, selectedAccommodationKeys);
		let preselectedUpdates = getPreselectedUpdates(accommodationPlacementId, preselectedAccommodationKeys, selectedAccommodationKeys);
		let toDelete = _.uniq(selectedUpdates.toDelete.concat(preselectedUpdates.toDelete));
		let toCreate = _.uniq(selectedUpdates.toCreate.concat(preselectedUpdates.toCreate));
		deletePreselections(accommodationPlacementId, toDelete);
		updatePreselectedAccommodations(accommodationPlacementId, toCreate);
	}
	let newPlaceholderKeys = getKeyArray(newPlaceholders);
	let previousPlaceholders = getPlaceholders(accommodationPlacementId);
	let toDeletePlaceholders = getArrayDiff(newPlaceholderKeys, previousPlaceholders);

	deletePlaceholders(toDeletePlaceholders, accommodationPlacementId);
	let newPlaceholdersObjects = getNewPlaceholdersObjects(newPlaceholders);
	savePlaceholders(newPlaceholdersObjects, accommodationPlacementId);

	adjustCityDays(cityBookingKey, durationNights, startDay);
	let accommodations = getAccommodations(cityBookingKey);
	accommodations.preselections = numberOfPreselections(accommodationPlacementId).preselections;
	return accommodations;
}

// Another patch update api for AccommodationPlacement, used for TA user.
// Will not delete the old serviceBookings, will just marked old serviceBookings as inactive=true
function patchAccommodationPlacement2(cityBookingKey, accommodationPlacementKey, durationNights, startDay, selectedAccommodationKeys, preselectedAccommodationKeys, newPlaceholders) {
	accommodationPlacementKey = removeCollectionFromKey(accommodationPlacementKey);
	let accommodationPlacementId = 'accommodationPlacements/' + accommodationPlacementKey;
  let accommodationPlacement = db.accommodationPlacements.document(accommodationPlacementKey);
  if (accommodationPlacement) {
		// TA user should not be able to change durationNights, startDate it.
    // updateAccomodationPlacement(accommodationPlacementId, durationNights, startDay);

    let selectedUpdates = getSelectedUpdates(accommodationPlacementId, selectedAccommodationKeys);

		// let serviceBookingIdsToDel = getServiceBookingToDelete(accommodationPlacementId, selectedUpdates.toDelete);
    // markServiceBookingsIsInactive(accommodationPlacementId, serviceBookingIdsToDel, true);
		removeServiceBookings(accommodationPlacementId, selectedUpdates.toDelete);

    if (selectedUpdates.toCreate && selectedUpdates.toCreate.length) {
      let serviceBookings = createServiceBookings(selectedUpdates.toCreate);
      createAccommodationEdges(serviceBookings, accommodationPlacement._id);
      createUseAccommodationEdges(serviceBookings, selectedUpdates.toCreate);
    }
    createUseSupplierEdges(accommodationPlacement._id, selectedAccommodationKeys);

		// TA user should not be able to change preselections.

    // const serviceBookingIdsSelected = getServiceBookingToDelete(accommodationPlacementId, selectedAccommodationKeys);
    // markServiceBookingsIsInactive(accommodationPlacementId, serviceBookingIdsSelected, false);
  }

  let newPlaceholderKeys = getKeyArray(newPlaceholders);
  let previousPlaceholders = getPlaceholders(accommodationPlacementId);
  let toDeletePlaceholders = getArrayDiff(newPlaceholderKeys, previousPlaceholders);

  deletePlaceholders(toDeletePlaceholders, accommodationPlacementId);
  let newPlaceholdersObjects = getNewPlaceholdersObjects(newPlaceholders);
  savePlaceholders(newPlaceholdersObjects, accommodationPlacementId);

  // adjustCityDays(cityBookingKey, durationNights, startDay);
  let accommodations = getAccommodations(cityBookingKey);
  accommodations.preselections = numberOfPreselections(accommodationPlacementId).preselections;
  return accommodations;
}

function deleteAccommodationPlacement(cityBookingKey, accommodationPlacementKey, durationNights, startDay, selectedAccommodationKeys,
																			preselectedAccommodationKeys) {
	let accommodationPlacementId = 'accommodationPlacements/' + accommodationPlacementKey;
	let selectedUpdates = getSelectedUpdates(accommodationPlacementId, selectedAccommodationKeys);
	let selectedPlaceholderUpdates = getSelectedUpdatesPlaceholders(accommodationPlacementId);
	removeServiceBookings(accommodationPlacementId, selectedUpdates.toDelete);
	let preselectedUpdates = getPreselectedUpdates(accommodationPlacementId, preselectedAccommodationKeys, selectedAccommodationKeys);
	let toDelete = _.uniq(selectedUpdates.toDelete.concat(preselectedUpdates.toDelete));
	deletePreselections(accommodationPlacementId, toDelete);
	removePlaceholderServiceBookings(selectedPlaceholderUpdates.toDelete);
	removeAccommodationPlacement(accommodationPlacementId);
	let accommodations = getAccommodations(cityBookingKey);
	accommodations.preselections = numberOfPreselections(accommodationPlacementId).preselections;
	return accommodations;
}

function getKeyArray(newPlaceholders) {
	let result = [];
	if (newPlaceholders.length) {
		for (let i = 0; i < newPlaceholders.length; i++) {
			if (newPlaceholders[i].serviceBookingKey) {
				result.push({serviceBookingKey: newPlaceholders[i].serviceBookingKey});
			}
		}
	}
	return result;
}

_accomodationPlacements.patchAccommodations = patchAccommodations;
function patchAccommodations(cityBookingKey, durationNights, startDay, accommodationPlacementKey, selectedAccommodationKeys, preselectedAccommodationKeys, newPlaceholders, action, startDate) {
	let result = {};
	switch (action.toUpperCase()) {
		case 'ADD':
			result = addNewAccommodationPlacement(cityBookingKey, durationNights, startDay, preselectedAccommodationKeys,
				selectedAccommodationKeys, newPlaceholders, startDate);
			break;
		case 'UPDATE':
			result = patchAccommodationPlacement(cityBookingKey, accommodationPlacementKey, durationNights, startDay, selectedAccommodationKeys,
				preselectedAccommodationKeys, newPlaceholders, startDate);
			break;
		case 'UPDATE2':
		  result = patchAccommodationPlacement2(cityBookingKey, accommodationPlacementKey, durationNights, startDay, selectedAccommodationKeys,
	        preselectedAccommodationKeys, newPlaceholders);
		  break;
		case 'DELETE':
			result = deleteAccommodationPlacement(cityBookingKey, accommodationPlacementKey, durationNights, startDay, [], []);
			break;
		case 'LAB':
			/*--const traversal = require("@arangodb/graph/traversal");
			let config = {
				datasource: traversal.generalGraphDatasourceFactory('exo-dev'),
				strategy: 'depthfirst',
				order: 'preorder',
				uniqueness: {vertices: 'global'},--*/
/*
				filter: function (config, vertex, path) {
					if (vertex.hasOwnProperty('durationNights')) {
						res += (vertex.durationNights + 1);
					}
					if (vertex.hasOwnProperty('durationDays')) {
						res += (vertex.durationDays);
					}

				},
*/
				/*--expander: traversal.outboundExpander,--*/
				/*sort: function (l, r) { return l._key < r._key ? 1 : -1; },*/
/*--
				visitor: function (config, res, vertex, path) {
					if (vertex.hasOwnProperty('durationNights')) {
						res.push(vertex);
					}
					if (vertex.hasOwnProperty('durationDays')) {
						res.push(vertex);
					}
				}
			};
--*/
			/*let res = {
				visited: {
					vertices: []
				}
			};*/
/*--
			let res = [];
			let traverser = new traversal.Traverser(config);
			var startVertex = db._document('trips/5102921');
			traverser.traverse(res, startVertex);
			result = res;
--*/
result = Trip('5142956');
break;
	}
	return result;
}
