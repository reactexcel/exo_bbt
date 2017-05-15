'use strict';
const db = require('@arangodb').db;
const moment = require('moment');
const removeCountryCode = require('../utils/serversAndCountries').removeCountryCode;

const _serviceBookings = require('./servicebookings');
const _trips = db._collection('trips');
module.exports = _trips;

_trips.getPaxList = getPaxList;
function getPaxList(tripKey) {
	let aqlQuery = `
	LET tripId = CONCAT('trips/', @tripKey)
	FOR vertex IN 1..1 OUTBOUND tripId GRAPH 'exo-dev'
    FILTER IS_SAME_COLLECTION('paxs', vertex)
    LET paxtype = SUBSTITUTE(vertex.ageGroup, ['adults', 'children', 'infants'], ['A', 'C', 'I'])
    RETURN {
        title: vertex.title,
        forename: vertex.firstName,
        surename: vertex.lastName,
        paxtype: paxtype
        }`;
	db._query(aqlQuery, {tripKey}).next();
}


_trips.getStartDate = getStartDate;
function getStartDate(tripKey) {
	let aqlQuery = `
  LET tripId = CONCAT('trips/', @tripKey)
  FOR vertex IN 0..0 ANY tripId GRAPH 'exo-dev'
		RETURN vertex.startDate`;
	return db._query(aqlQuery, {tripKey}).next();
}

_trips.addCountryBookingKeyToTrip = addCountryBookingKeyToTrip;
function addCountryBookingKeyToTrip(tripKey, countryBookingKey) {
	let trip = db.trips.document(tripKey);
	let countryOrder = trip.countryOrder;
	if (countryOrder) {
		countryOrder.push(countryBookingKey);
	} else {
		countryOrder = [countryBookingKey];
	}
	trip.countryOrder = countryOrder;
	this.update(tripKey, trip);
}

_trips.updateStartDayAndDuration = updateStartDayAndDuration;

function updateStartDayAndDuration(tripKey) {
	const aqlGetTripStructureQuery = `
		LET tripId = CONCAT('trips/', @tripKey)
		LET trip = DOCUMENT(tripId)
		LET tripCountryOrder = NOT_NULL(trip.countryOrder) ? trip.countryOrder : []
		LET countryBookings = (
    	FOR countryBookingKey IN tripCountryOrder
	    	LET countryBookingId = CONCAT('countryBookings/', countryBookingKey)
				LET countryBooking = DOCUMENT(countryBookingId)
				LET countryBookingCityOrder = NOT_NULL(countryBooking.cityOrder) ? countryBooking.cityOrder : []
			RETURN MERGE(countryBooking, {
	    	cityBookings: (
	        FOR cityBookingKey IN countryBookingCityOrder
						LET cityBookingId = CONCAT('cityBookings/', cityBookingKey)
						LET cityBooking = DOCUMENT(cityBookingId)
						LET cityBookingDayOrder = NOT_NULL(cityBooking.dayOrder) ? cityBooking.dayOrder : []
						LET tp = (
				    	for tp in 1..1 inbound cityBookingId graph 'exo-dev'
				        filter is_same_collection('transferPlacements', tp)
				    	return tp
						)
						let dd = (for t in 1..1 inbound cityBookingId graph 'exo-dev'
                            filter is_same_collection('transferPlacements', t)
                            return t.durationDays)
					RETURN MERGE(cityBooking, {
			    	cityDays: (
				    	FOR cityDayKey IN cityBookingDayOrder
					    	LET cityDayId = CONCAT('cityDays/', cityDayKey)
								LET cityDay = DOCUMENT(cityDayId)
							RETURN cityDay
					)},
			    {
			        transferPlacements: tp
			    },
			    { dayOffSet: is_null(MAX(dd)) ? 0 : MAX(dd)-1}
				)
	    )
	})
)

RETURN MERGE(trip, {countryBookings: countryBookings})`;

	let structure = db._query(aqlGetTripStructureQuery, {'tripKey': tripKey}).next();

	let startDate = moment(structure.startDate).format('YYYY-MM-DD');
	let currentDay = 1;
	let currentDate = moment(startDate).format('YYYY-MM-DD');
	let tripStartDate = moment(startDate).format('YYYY-MM-DD');
	let tripEndDate = moment(startDate).format('YYYY-MM-DD');
	let tripDurationDays = 0;
	let first = true;
	// Inject dates
	structure.countryBookings.forEach((countryBooking) => {
		countryBooking.cityBookings.forEach((cityBooking) => {
			let dayOffSet = 0;
			let transferDurationDays = 0;
			// Update Transfer placement
			cityBooking.transferPlacements.forEach((transferPlacement) => {
				transferDurationDays = transferPlacement.durationDays;
				if (!transferDurationDays) {
					db._update(transferPlacement._id, { durationDays: 1 });
					transferDurationDays = 1;
				}
				if (transferDurationDays > 0) {
					//console.log('transferPlacement', transferPlacement._id, `{ startDate: ${currentDate}, startDay: ${currentDay} }`);
					if (first) {
						currentDay = 1;
						currentDate = moment(structure.startDate).format('YYYY-MM-DD');
						first = false;
					} else {
						currentDay -= 1;
						currentDate = moment(currentDate).subtract(1, 'd').format('YYYY-MM-DD');
					}
					const transferPlacementStartDate = moment(currentDate).format('YYYY-MM-DD');
					db._update(transferPlacement._id, { startDate: transferPlacementStartDate, startDay: currentDay });
					//console.log('transferPlacement', transferPlacement._id, `{ startDate: ${transferPlacementStartDate}, startDay: ${currentDay} }`);
					dayOffSet = transferDurationDays-1;
				}
			});

			cityBooking.cityDays.forEach((cityDay) => {
				// updateStartDayAndDuration cityDay
				if (first) {
					currentDay = 1;
					currentDate = moment(structure.startDate).format('YYYY-MM-DD');
					first = false;
				} else {
					currentDate = (dayOffSet > 0) ? moment(currentDate).add(dayOffSet, 'd').format('YYYY-MM-DD') : moment(currentDate).format('YYYY-MM-DD');
					currentDay += dayOffSet;
				}
				db._update(cityDay._id, { startDay: currentDay, startDate: currentDate });
				//console.log('cityDay', cityDay._id, `{ startDate: ${currentDate}, startDay: ${currentDay} }`);
				currentDay += 1;
				currentDate = moment(currentDate).add(1, 'd');
				//console.log('New values::: cityDay', cityDay._id, `{ startDate: ${currentDate}, startDay: ${currentDay} }`);
				dayOffSet = 0;
			});

			// Update cityBooking
			if (cityBooking.cityDays && cityBooking.cityDays[0]) {
				cityBooking.startDay = cityBooking.cityDays[0].startDay;
				cityBooking.startDate = cityBooking.cityDays[0].startDate;
				db._update(cityBooking._id, {
					durationDays: cityBooking.cityDays.length,
					durationNights: cityBooking.cityDays.length - 1,
					startDay: cityBooking.startDay,
					startDate: cityBooking.startDate
				});
			}
		});

		// Update countryBooking
		if (countryBooking.cityBookings && countryBooking.cityBookings[0]) {
			let days = [];
			countryBooking.cityBookings.forEach((c) => {
				if (c.cityDays.length) {
					c.cityDays.forEach((cd) => {
						days.push(cd.startDay);
					});
				}
			});
			days = days.filter(function (item, index, inputArray) {
				return inputArray.indexOf(item) === index;
			});
			let durationDays = days.length;
			let maxDay = days[durationDays - 1];
			tripEndDate = moment(tripStartDate).add(maxDay - 1, 'days').format('YYYY-MM-DD');
			countryBooking.startDay = countryBooking.cityBookings[0].startDay;
			countryBooking.startDate = countryBooking.cityBookings[0].startDate;
			db._update(countryBooking._id, { durationDays: durationDays, durationNights: durationDays - 1, startDay: countryBooking.startDay, startDate: countryBooking.startDate });
			tripDurationDays = maxDay;
		}
	});
	if (tripStartDate) {
		//console.log(`..:: UPDATE TRIP ::.., trips/${tripKey}, durationDays, ${tripDurationDays}, startDate: ${tripStartDate}, endDate, ${tripEndDate}`);
		db._update(`trips/${tripKey}`, {durationDays: tripDurationDays, startDate: tripStartDate, endDate: tripEndDate});
	}
	return { tripRecalculated: true };
}

/*function updateStartDayAndDuration(tripKey) {
	const aqlGetTripStructureQuery = `
		LET tripId = CONCAT('trips/', @tripKey)
		LET trip = DOCUMENT(tripId)
		LET tripCountryOrder = NOT_NULL(trip.countryOrder) ? trip.countryOrder : []
		LET countryBookings = (
    	FOR countryBookingKey IN tripCountryOrder
	    	LET countryBookingId = CONCAT('countryBookings/', countryBookingKey)
				LET countryBooking = DOCUMENT(countryBookingId)
				LET countryBookingCityOrder = NOT_NULL(countryBooking.cityOrder) ? countryBooking.cityOrder : []
			RETURN MERGE(countryBooking, {
	    	cityBookings: (
	        FOR cityBookingKey IN countryBookingCityOrder
						LET cityBookingId = CONCAT('cityBookings/', cityBookingKey)
						LET cityBooking = DOCUMENT(cityBookingId)
						LET cityBookingDayOrder = NOT_NULL(cityBooking.dayOrder) ? cityBooking.dayOrder : []
						LET tp = (
				    	for tp in 1..1 inbound cityBookingId graph 'exo-dev'
				        filter is_same_collection('transferPlacements', tp)
				    	return tp
						)
						let dd = (for t in 1..1 inbound cityBookingId graph 'exo-dev'
                            filter is_same_collection('transferPlacements', t)
                            return t.durationDays)
					RETURN MERGE(cityBooking, {
			    	cityDays: (
				    	FOR cityDayKey IN cityBookingDayOrder
					    	LET cityDayId = CONCAT('cityDays/', cityDayKey)
								LET cityDay = DOCUMENT(cityDayId)
							RETURN cityDay
					)},
			    {
			        transferPlacements: tp
			    },
			    { dayOffSet: is_null(MAX(dd)) ? 0 : MAX(dd)-1}
				)
	    )
	})
)

RETURN MERGE(trip, {countryBookings: countryBookings})`;

	let structure = db._query(aqlGetTripStructureQuery, {'tripKey': tripKey}).next();

	let startDate = moment(structure.startDate).format('YYYY-MM-DD');
	let currentDay = 1;
	let currentDate = moment(startDate).format('YYYY-MM-DD');
	let tripStartDate = moment(startDate).format('YYYY-MM-DD');
	let tripEndDate = moment(startDate).format('YYYY-MM-DD');
	let tripDurationDays = 0;
	let dayLookup = {};
	// Inject dates
	structure.countryBookings.forEach((countryBooking) => {
		countryBooking.cityBookings.forEach((cityBooking) => {
			let dayOffSet = cityBooking.dayOffSet;
			let transferPlacementDate = moment(currentDate).format('YYYY-MM-DD');
			cityBooking.cityDays.forEach((cityDay) => {
				// updateStartDayAndDuration cityDay
				currentDate = (dayOffSet > 0) ? moment(currentDate).add(dayOffSet, 'd').format('YYYY-MM-DD') : moment(currentDate).format('YYYY-MM-DD');
				currentDay += dayOffSet;
				db._update(cityDay._id, { startDay: currentDay, startDate: currentDate });
				dayLookup[currentDate] = currentDay;
				currentDay += 1;
				currentDate = moment(currentDate).add(1, 'd');
				dayOffSet = 0;
			});

			// Update cityBooking
			if (cityBooking.cityDays && cityBooking.cityDays[0]) {
				cityBooking.startDay = cityBooking.cityDays[0].startDay;
				cityBooking.startDate = cityBooking.cityDays[0].startDate;
				db._update(cityBooking._id, {
					durationDays: cityBooking.cityDays.length,
					durationNights: cityBooking.cityDays.length - 1,
					startDay: cityBooking.startDay,
					startDate: cityBooking.startDate
				});
			}
			// Update Transfer placement
			cityBooking.transferPlacements.forEach((transferPlacement) => {
				let durationDays = transferPlacement.durationDays;
				if (!durationDays) {
					db._update(transferPlacement._id, { durationDays: 1 });
					durationDays = 1;
				}
				if (durationDays > 0) {
					// const transferPlacementStartDate = moment(lastDate).subtract(1, 'd').format('YYYY-MM-DD');
					const transferPlacementStartDate = transferPlacementDate;
					db._update(transferPlacement._id, { startDate: transferPlacementStartDate, startDay: dayLookup[transferPlacementStartDate] });
					currentDate = moment(currentDate).add((durationDays - 1), 'd').format('YYYY-MM-DD');
					currentDate = moment(currentDate).subtract(1, 'd').format('YYYY-MM-DD');
					currentDay += ((durationDays - 1) - 1);
				}
			});
		});

		// Update countryBooking
		if (countryBooking.cityBookings && countryBooking.cityBookings[0]) {
			let durationDays = 0;
			countryBooking.cityBookings.forEach((c) => {
				if (c.cityDays.length) {
					durationDays += c.cityDays.length;
				}
			});

			countryBooking.startDay = countryBooking.cityBookings[0].startDay;
			countryBooking.startDate = countryBooking.cityBookings[0].startDate;
			db._update(countryBooking._id, {durationDays: durationDays, durationNights: durationDays - 1, startDay: countryBooking.startDay, startDate: countryBooking.startDate});
			if (tripStartDate === startDate) {
				tripStartDate = countryBooking.startDate;
			}
			if (countryBooking.startDate) {
				tripEndDate = countryBooking.startDate.toString();
				tripEndDate = moment(countryBooking.startDate.toString()).add(durationDays - 1, 'days').format('YYYY-MM-DD');
			}
			tripDurationDays += durationDays;
		}
	});
	if (tripStartDate) {
		//console.log('..::UPDATE TRIP::..', `trips/${tripKey}`, 'durationDays', tripDurationDays, 'endDate', tripEndDate);
		db._update(`trips/${tripKey}`, {durationDays: tripDurationDays, startDate: tripStartDate, endDate: tripEndDate});
	}
}
*/

/*function updateStartDayAndDuration(tripKey) {
	const aqlGetTripStructureQuery = `
		LET tripId = CONCAT('trips/', @tripKey)
		LET trip = DOCUMENT(tripId)
		LET tripCountryOrder = NOT_NULL(trip.countryOrder) ? trip.countryOrder : []
		LET countryBookings = (
    	FOR countryBookingKey IN tripCountryOrder
	    	LET countryBookingId = CONCAT('countryBookings/', countryBookingKey)
				LET countryBooking = DOCUMENT(countryBookingId)
				LET countryBookingCityOrder = NOT_NULL(countryBooking.cityOrder) ? countryBooking.cityOrder : []
			RETURN MERGE(countryBooking, {
	    	cityBookings: (
	        FOR cityBookingKey IN countryBookingCityOrder
						LET cityBookingId = CONCAT('cityBookings/', cityBookingKey)
						LET cityBooking = DOCUMENT(cityBookingId)
						LET cityBookingDayOrder = NOT_NULL(cityBooking.dayOrder) ? cityBooking.dayOrder : []
						LET tp = (
				    	for tp in 1..1 inbound cityBookingId graph 'exo-dev'
				        filter is_same_collection('transferPlacements', tp)
				    	return tp
						)
						let dd = (for t in 1..1 inbound cityBookingId graph 'exo-dev'
                            filter is_same_collection('transferPlacements', t)
                            return t.durationDays)
					RETURN MERGE(cityBooking, {
			    	cityDays: (
				    	FOR cityDayKey IN cityBookingDayOrder
					    	LET cityDayId = CONCAT('cityDays/', cityDayKey)
								LET cityDay = DOCUMENT(cityDayId)
							RETURN cityDay
					)},
			    {
			        transferPlacements: tp
			    },
			    { dayOffSet: is_null(MAX(dd)) ? 0 : MAX(dd)-1}
				)
	    )
	})
)

RETURN MERGE(trip, {countryBookings: countryBookings})`;

	let structure = db._query(aqlGetTripStructureQuery, {'tripKey': tripKey}).next();

	let startDate = moment(structure.startDate).format('YYYY-MM-DD');
	let lastDay = 0;
	let lastDate = moment(startDate).format('YYYY-MM-DD');
	let tripStartDate = moment(startDate).format('YYYY-MM-DD');
	let tripEndDate = moment(startDate).format('YYYY-MM-DD');
	let tripDurationDays = 0;
	let dayLookup = {};
	// Inject dates
	structure.countryBookings.forEach((countryBooking) => {
		countryBooking.cityBookings.forEach((cityBooking) => {
			let dayOffSet = cityBooking.dayOffSet;
			let transferPlacementLastDate = moment(lastDate).format('YYYY-MM-DD');
			//console.log('offset:', dayOffSet);
			cityBooking.cityDays.forEach((cityDay) => {
				// updateStartDayAndDuration cityDay
				lastDate = moment(lastDate).format('YYYY-MM-DD');
				if (dayOffSet > 0) {
					lastDate = moment(lastDate).add(dayOffSet, 'd');
				}
				//console.log(`Day ${lastDay+1} Date ${lastDate}`);
				db._update(cityDay._id, { startDay: lastDay + 1 + dayOffSet, startDate: lastDate });
				dayLookup[lastDate] = lastDay+1;
				lastDay += 1 + dayOffSet;
				if (dayOffSet > 0) {
					lastDate = moment(lastDate).add(dayOffSet, 'd');
				} else {
					lastDate = moment(lastDate).add(1, 'd');
				}
				// console.log(`UpdateStartDayAndDuration cityDay... lastDay: ${lastDay} lastDate: ${lastDate} dayOffset: ${dayOffSet}`);
				dayOffSet = 0;
			});

			// Update cityBooking
			if (cityBooking.cityDays && cityBooking.cityDays[0]) {
				cityBooking.startDay = cityBooking.cityDays[0].startDay;
				cityBooking.startDate = cityBooking.cityDays[0].startDate;
				db._update(cityBooking._id, { durationDays: cityBooking.cityDays.length, durationNights: cityBooking.cityDays.length - 1, startDay: cityBooking.startDay, startDate: cityBooking.startDate });
				//console.log(`Update cityBooking... lastDay: ${lastDay} lastDate: ${lastDate}`);
			}
			// Update Transfer placement
			cityBooking.transferPlacements.forEach((transferPlacement) => {
				let durationDays = transferPlacement.durationDays;
				if (!durationDays) {
					db._update(transferPlacement._id, { durationDays: 1 });
					durationDays = 1;
				}
				//console.log(`Update Transfer placement durationDays: ${durationDays} lastDay: ${lastDay} transferPlacementLastDate: ${transferPlacementLastDate}`);
				if (durationDays > 0) {
					// const transferPlacementStartDate = moment(lastDate).subtract(1, 'd').format('YYYY-MM-DD');
					const transferPlacementStartDate = transferPlacementLastDate;
					//console.log(`StartDate: ${transferPlacementStartDate} startDay: ${dayLookup[transferPlacementStartDate]}`);
					db._update(transferPlacement._id, { startDate: transferPlacementStartDate, startDay: dayLookup[transferPlacementStartDate] });
					lastDate = moment(lastDate).add((durationDays - 1), 'd').format('YYYY-MM-DD');
					lastDate = moment(lastDate).subtract(1, 'd').format('YYYY-MM-DD');
					lastDay += ((durationDays - 1) - 1);
					//console.log(`Update Transfer placement... ID: ${transferPlacement._id} lastDay: ${lastDay} lastDate: ${lastDate}`);
				}
			});
		});

		// Update countryBooking
		if (countryBooking.cityBookings && countryBooking.cityBookings[0]) {
			let durationDays = 0;
			countryBooking.cityBookings.forEach((c) => {
				if (c.cityDays.length) {
					durationDays += c.cityDays.length;
				}
			});

			countryBooking.startDay = countryBooking.cityBookings[0].startDay;
			countryBooking.startDate = countryBooking.cityBookings[0].startDate;
			db._update(countryBooking._id, {durationDays: durationDays, durationNights: durationDays - 1, startDay: countryBooking.startDay, startDate: countryBooking.startDate});
			if (tripStartDate === startDate) {
				tripStartDate = countryBooking.startDate;
			}
			if (countryBooking.startDate) {
				tripEndDate = countryBooking.startDate.toString();
				tripEndDate = moment(countryBooking.startDate.toString()).add(durationDays - 1, 'days').format('YYYY-MM-DD');
			}
			tripDurationDays += durationDays;
		}
	});
	if (tripStartDate) {
		//console.log('..::UPDATE TRIP::..', `trips/${tripKey}`, 'durationDays', tripDurationDays, 'endDate', tripEndDate);
		db._update(`trips/${tripKey}`, {durationDays: tripDurationDays, startDate: tripStartDate, endDate: tripEndDate});
	}
}*/

_trips.getTrip = getTrip;
function getTrip(tripKey) {
	let aqlGetTripQuery = `
		LET tripId = CONCAT("trips/", @tripKey)
		LET trip = DOCUMENT(tripId)
		let lastCountry = not_null(trip.countryOrder) ? last(trip.countryOrder) : null
    let cb = not_null(lastCountry) ? document(concat('countryBookings/', lastCountry)) : null
    let lastCity = not_null(cb) ? last(cb.cityOrder) : null
    let cityB = not_null(lastCity) ? document(concat('cityBookings/', lastCity)) : null
		let departureTransfer = FIRST(
		    for dep in 1..1 outbound tripId graph 'exo-dev'
		        filter not_null(dep) && is_same_collection('transferPlacements', dep) && (dep.type == 'departureTransfer')
		    return dep
		)
		let departureTransferPlacement = MERGE(departureTransfer, {departureCityOrigin: cityB})
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
							LET serviceBookings = (
								LET serviceBookingIds = (FOR vertex, edge IN OUTBOUND cityBookingEdge._to bookIn RETURN edge)
								FOR serviceBookingId IN serviceBookingIds
								FOR serviceBooking IN serviceBookings
									FILTER serviceBooking._id == serviceBookingId._to
									RETURN MERGE(serviceBooking, {inactive: serviceBookingId.inactive}, { accommodation: FIRST(
										LET accommodationIds = (FOR vertex, edge IN OUTBOUND serviceBooking._id use RETURN edge)
										FOR accommodationId IN accommodationIds
										FOR accommodation IN accommodations
											FILTER accommodation._id == accommodationId._to
											RETURN accommodation
									)})
							)
							LET accommodationSelected = (FOR serviceBooking in serviceBookings filter serviceBooking.accommodation != null return serviceBooking.accommodation._id)
							LET accommodationPreselections = (FOR vertex, edge IN 1..1 OUTBOUND accommodationPlacement._id preselect RETURN edge._to)
							LET preselectionWithoutSelected = MINUS(accommodationPreselections, accommodationSelected)
							RETURN MERGE(accommodationPlacement, {supplier: FIRST(
									FOR supplyEdge IN supplyEdges
										FOR supplier IN suppliers
											FILTER supplyEdge._to == supplier._id
											RETURN supplier)}, {images: FIRST(
												FOR supplyEdge IN supplyEdges
												FOR supplier IN suppliers
													FILTER supplyEdge._to == supplier._id
													RETURN supplier.images)}, { serviceBookings: serviceBookings }, { preselectionNum: LENGTH(preselectionWithoutSelected) })
						)

						RETURN MERGE(cityBooking, {accommodationPlacements: theAccommodationPlacements, cityDays: (

							FOR cityDayKey IN cityBookingDayOrder
								LET cityDayId = CONCAT("cityDays/", cityDayKey)
								LET cityDay = DOCUMENT(cityDayId)

								let serviceBookings = (
									LET serviceBookingIds = (FOR vertex, edge IN OUTBOUND cityDay._id bookIn RETURN edge)
									FOR serviceBookingId IN serviceBookingIds
										FOR serviceBooking IN serviceBookings
											FILTER serviceBooking._id == serviceBookingId._to
											RETURN MERGE(serviceBooking, {inactive: serviceBookingId.inactive},{ tour: FIRST(
												LET tourIds = (FOR vertex, edge IN OUTBOUND serviceBooking._id use RETURN edge)
												FOR tourId IN tourIds
													FOR tour IN tours
														FILTER tour._id == tourId._to
															RETURN tour
											)})
								)
								let toursIdSelected = (FOR serviceBooking in serviceBookings filter serviceBooking.tour != null return serviceBooking.tour._id)
                let preselections = (FOR vertex, edge IN 1..1 OUTBOUND cityDayId preselect
                    Filter edge._to not in toursIdSelected
                    RETURN { startSlot: edge.startSlot, tourId: edge._to })
								RETURN MERGE(cityDay,  { serviceBookings: serviceBookings, preselections })
						)})
				)})
		)

		let booked = (
    	for serviceBooking in 4..4 outbound trip._id graph 'exo-dev'
        filter !is_null(serviceBooking) && is_same_collection('serviceBookings', serviceBooking) &&
            serviceBooking.status.tpBookingStatus == 'OK'
    	return serviceBooking)
		let accList = (for sb in booked
    	for acc in 1..1 inbound sb._id graph 'exo-dev'
        filter !is_null(acc) && is_same_collection('accommodationPlacements', acc)
    	return {lastBookedDay: acc.startDay + acc.durationNights})
		let tour_LocaltransferList = (for sb in booked
    	for day in 1..1 inbound sb._id graph 'exo-dev'
        filter !is_null(day) && is_same_collection('cityDays', day)
    	return {lastBookedDay: day.startDay})
		let cityList = (for sb in booked
    	for city in 1..2 inbound sb._id graph 'exo-dev'
        filter is_same_collection('cityBookings', city)
    	return {lastBookedDay: city.startDay + city.durationNights})

		let lastbookedday = max(append(append(accList, tour_LocaltransferList), cityList))
		let lastBookedDay = is_null(lastbookedday) ? {lastBookedDay:0} : lastbookedday

		let cityDays = (for cityDays in 3..3 outbound tripId graph 'exo-dev'
    	filter is_same_collection('cityDays', cityDays)
		return cityDays)

		let lastbookeddate = FIRST(for day in cityDays
    	filter day.startDay == lastBookedDay.lastBookedDay
   	 	COLLECT startDate = day.startDate
		return startDate)

		let lastBookedDate = is_null(lastbookeddate) ? {lastBookedDate:trip.startDate} : {lastBookedDate:lastbookeddate}

		RETURN MERGE(MERGE(trip, lastBookedDay, lastBookedDate), lastBookedDay,{departureTransferPlacement: departureTransferPlacement}, {countryBookings: countryBookings})`;
	let result = db._query(aqlGetTripQuery, {'tripKey': tripKey}).next();
	return result;
}

_trips.bookTripBookingToTourplan = bookTripBookingToTourplan;
function bookTripBookingToTourplan(tripBookingKey) {
	let aqlQuery = `
	LET tripId = CONCAT('trips/', @tripBookingKey)
	LET nonBookedServiceBookings = (FOR serviceBooking IN 4..4 OUTBOUND tripId GRAPH 'exo-dev'
    	FILTER IS_SAME_COLLECTION('serviceBookings', serviceBooking) && serviceBooking.status.state == 'Available'
    	RETURN serviceBooking._key)
	RETURN nonBookedServiceBookings`;
	let serviceBookingKeys = db._query(aqlQuery, {tripBookingKey}).next();
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

_trips.removeTripBookingToTourplan = removeTripBookingToTourplan;
function removeTripBookingToTourplan(tripBookingKey) {
	let aqlQuery = `
	LET tripId = CONCAT('trips/', @tripBookingKey)
	LET nonBookedServiceBookings = (FOR serviceBooking IN 4..4 OUTBOUND tripId GRAPH 'exo-dev'
    	FILTER IS_SAME_COLLECTION('serviceBookings', serviceBooking) && serviceBooking.status.state == 'Booked'
    	RETURN serviceBooking._key)
	RETURN nonBookedServiceBookings`;
	let serviceBookingKeys = db._query(aqlQuery, {tripBookingKey}).next();
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

_trips.getTripCountryCityTree = getTripCountryCityTree;
function getTripCountryCityTree(tripKey) {
	const aqlQueryTripTree = `
    LET tripId = CONCAT('trips/', @tripKey)
    LET countries = DOCUMENT(tripId).countryOrder
		FOR country IN countries
    LET countryId = CONCAT('countryBookings/', country)
    LET citieKeys = DOCUMENT(countryId).cityOrder
    LET cities = (FOR city IN citieKeys RETURN DOCUMENT(CONCAT('cityBookings/', city)))
    RETURN {id: DOCUMENT(countryId)._id, title: DOCUMENT(countryId).countryCode,
      children: (FOR city IN cities RETURN {id: city._id, title: city.cityCode, children: []}) }`;
	return db._query(aqlQueryTripTree, {tripKey}).toArray();
}

function updateCountryBookingCityOrder(countryId, cityOrder) {
	const aqlUpdateQuery = `
		LET countryBooking = DOCUMENT(@countryId)
		UPDATE countryBooking WITH {cityOrder: @cityOrder} IN countryBookings
		RETURN NEW`;
	return db._query(aqlUpdateQuery, {countryId, cityOrder}).toArray();
}

function updateTripBookingCountryOrder(tripKey, countryOrder) {
	const aqlUpdateQuery = `
		LET tripId = CONCAT('trips/', @tripKey)
		LET trip = DOCUMENT(tripId)
		UPDATE trip WITH {countryOrder: @countryOrder} IN trips
		RETURN NEW`;
	return db._query(aqlUpdateQuery, {tripKey, countryOrder}).toArray();
}

_trips.mutateTripCountryCityTree = mutateTripCountryCityTree;
function mutateTripCountryCityTree(tripKey, tree) {
	const countryOrder = [];
	tree.forEach(function (country) {
		countryOrder.push(country.id);
		let cityOrder = [];
		country.children.forEach(function (city) {
			cityOrder.push(city.id);
		});
		updateCountryBookingCityOrder(country.id, cityOrder);
	});
	updateTripBookingCountryOrder(tripKey, countryOrder);
	updateStartDayAndDuration(tripKey);
	return getTripCountryCityTree(tripKey);
}
