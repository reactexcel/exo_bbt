'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

const joi = require('joi');
const CityDays = require('../repositories/cityday');
const Tours = require('../repositories/tours');
const CityBookings = require('../repositories/citybookings');
const addToEdge = require('../utils').addToEdge;
const removeEdges = require('../utils').removeEdges;

const cityDayIdSchema = joi.string().required()
	.description('The id of the CityDay')
	.meta({allowMultiple: false});

/** Removes a  cityday.
 *
 * Removes a cityday. The information has to be in the
 * requestBody.
 */
router.post('/remove-city-day', function (req, res) {
	let cityday = req.body;
	// console.log('--- REMOVE CITY DAY ---', cityday);
	let clientMutationId = cityday.clientMutationId;
	let cityDayKey = cityday.cityDayKey;
	let cityBooking = CityBookings.removeCityDay(cityDayKey);
	cityBooking.clientMutationId = clientMutationId;
	// TEMP
	CityDays.TEMP_addDateToCityDays(cityBooking.cityDays);
	// END TEMP
	res.json(cityBooking);
})
	.body(require('../models/removeCityDay'), 'The city you want to remove');

/** Creates a new cityday.
 *
 * Creates a new cityday. The information has to be in the
 * requestBody.
 */
router.post('/', function (req, res) {
	let cityday = req.body;
	// console.log('--- ADD CITY DAY ---', cityday);
	let clientMutationId = cityday.clientMutationId;
	delete cityday.clientMutationId;
	let cityBookingKey = cityday.cityBookingKey;
	delete cityday.cityBookingKey;
	let dayIndex = cityday.dayIndex;
	delete cityday.dayIndex;
	let cityDay = CityDays.save(cityday);
	addToEdge('cityBookings', cityBookingKey, 'cityDays', cityDay._key, 'bookIn', {label: "BookIn"});
	// console.log('--- INSERT CITY DAY ---', 'cityBookingKey', cityBookingKey, 'cityDay._key', cityDay._key, 'dayIndex', dayIndex);
	CityBookings.insertCityDay(cityBookingKey, cityDay._key, dayIndex);
	let cityBooking = CityBookings.getServiceBookings(cityBookingKey);
	cityBooking.clientMutationId = clientMutationId;
	// TEMP
	CityDays.TEMP_addDateToCityDays(cityBooking.cityDays);
	// END TEMP
	res.json(cityBooking);
})
	.body(require('../models/citydays'), 'The city you want to create');


/** Removes a cityday.
 *
 * Removes a cityday.
 */
router.delete('/:cityDayKey', function (req, res) {
	let cityDayKey = req.pathParams.cityDayKey;
	CityDays.remove(cityDayKey);
	removeEdges('preselect', 'cityDays', cityDayKey, 'startSlot', 1);
	removeEdges('preselect', 'cityDays', cityDayKey, 'startSlot', 2);
	removeEdges('preselect', 'cityDays', cityDayKey, 'startSlot', 3);
	removeEdges('bookIn', 'cityDays', cityDayKey, 'label', 'BookIn');
	res.json({success: true});
})
	.pathParam('cityDayKey', cityDayIdSchema)
	.error(404, 'The cityday could not be found');

/** Toggle preselect tour.
 *
 * Toggles preselect tour. The information has to be in the
 * requestBody.
 */
router.post('/toggle-preselect-tour', function(req, res) {
	let preselect = req.body;
	let cityDayKey = preselect.cityDayKey;
	delete preselect.cityDayKey;
	let tourKey = preselect.tourKey;
	delete preselect.tourKey;
	let startSlot = preselect.startSlot;
	let isPreselected = preselect.isPreselected;
	let result = {};
	if (isPreselected) {
		result = CityDays.addPreSelection('cityDays/' + cityDayKey, 'tours/' + tourKey, startSlot);
	} else {
		result = CityDays.deletePreSelection('cityDays/' + cityDayKey, 'tours/' + tourKey, startSlot);
	}
	if (result) {
		result = Tours.getTour('tours/' + tourKey);
		if (result.length > 0) {
			result = result[0];
			result.isPreselected = isPreselected;
			result.startSlot = startSlot;
			let promotions = result.promotions;
			if (promotions) {
				result.hasPromotions = (promotions.length > 0) || result.isPromotion;
			} else {
				result.hasPromotions = result.isPromotion;
			}
		}
	}
	res.json(result);
})
	.body(require('../models/preselecttour'), 'The preselection you want to create');

/** Creates a new preselect tour.
 *
 * Creates a new preselect tour. The information has to be in the
 * requestBody.
 */
router.post('/add-preselect-tour', function (req, res) {
	let preselect = req.body;
	let cityDayKey = preselect.cityDayKey;
	delete preselect.cityDayKey;
	let tourKey = preselect.tourKey;
	delete preselect.tourKey;
	let startSlot = preselect.startSlot;
	let result = CityDays.addPreSelection('cityDays/' + cityDayKey, 'tours/' + tourKey, startSlot);
	res.json(result);
})
	.body(require('../models/preselecttour'), 'The preselection you want to create');

/** Creates a remove preselect tour.
 *
 * Creates a remove preselect tour. The information has to be in the
 * requestBody.
 */
router.post('/remove-preselect-tour', function (req, res) {
	let preselect = req.body;
	let cityDayKey = preselect.cityDayKey;
	delete preselect.cityDayKey;
	let tourKey = preselect.tourKey;
	delete preselect.tourKey;
	let startSlot = preselect.startSlot;
	let result = CityDays.deletePreSelection('cityDays/' + cityDayKey, 'tours/' + tourKey, startSlot);
	res.json(result);
})
	.body(require('../models/preselecttour'), 'The preselection you want to create');

/** Tours in array.
 *
 * This function simply returns the list of tours that belongs to a cityDay.
 */
router.post('/get-tours-by-city-day-key', function (req, res) {
	let cityDayKey = req.body.cityDayKey;
	let result = CityDays.getTours(cityDayKey);
	res.json(result);
})
	.body(require('../models/cityDayByKey'), 'The city day of the tours you want to retrieve');

/** Patch Tours.
 *
 * This function simply patch tours in a city day.
 */
router.post('/patch-tours-by-city-day-key', function (req, res) {
	let cityDayKey = req.body.cityDayKey;
	let clientMutationId = req.body.clientMutationId;
	delete req.body.clientMutationId;
	let tourKeys = req.body.tourKeys;
	let placeholders = req.body.placeholders;
	let tours = CityDays.patchTours(cityDayKey, tourKeys, placeholders);
	tours.clientMutationId = clientMutationId;
	// TEMP
	CityDays.TEMP_addDateToCityDay(tours);
	// END TEMP
	res.json(tours);
})
	.body(require('../models/citydaypatchtour'), 'The tours you want to patch');