'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

const AccommodationPlacements = require('../repositories/accommodationplacements');

/** Patch a accommodationPlacement with accommodations.
 *
 * Patch a accommodationPlacement with accommodations. The information has to be in the
 * requestBody.
 */
router.post('/patch-acommodations-by-accommodation-keys', function (req, res) {
	let clientMutationId = req.body.clientMutationId;
	let cityBookingKey = req.body.cityBookingKey;
	let durationNights = req.body.durationNights;
	let startDay = req.body.startDay;
	let startDate = req.body.startDate;
	let accommodationPlacementKey = req.body.accommodationPlacementKey;
	let selectedAccommodationKeys = req.body.selectedAccommodationKeys;
	let preselectedAccommodationKeys = req.body.preselectedAccommodationKeys;
	let placeholders = req.body.placeholders;
	let action = req.body.action;
	let cityBooking = AccommodationPlacements.patchAccommodations(cityBookingKey, durationNights, startDay,
		accommodationPlacementKey, selectedAccommodationKeys, preselectedAccommodationKeys, placeholders, action, startDate);
	cityBooking.clientMutationId = clientMutationId;

	// TEMP
	// Removed by Thomas US# 2151 Start date & duration
	// cityBooking.cityDays = require('../repositories/cityday').TEMP_addDateToCityDays(cityBooking.cityDays);
	// END TEMP
	res.json(cityBooking);
})
	.body(require('../models/accommodationplacement'), 'The accommodationplacement you want to patch, create or delete');

