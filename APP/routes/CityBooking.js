'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

const db = require('@arangodb').db;
// const request = require('@arangodb/request');
const _ = require('underscore');
const joi = require('joi');
const addToEdge = require('../utils').addToEdge;
const CityBookings = require('../repositories/citybookings');
const CityDays = require('../repositories/cityday');
const CountryBookings = require('../repositories/countrybookings');
const ServiceBookings = require('../repositories/servicebookings');

const citybookingIdSchema = joi.string().required()
	.description('The id of the CityBooking')
	.meta({allowMultiple: false});

/*eslint global-require: 1*/
/*eslint new-cap: 1*/

/** Lists of all citybookings.
 *
 * This function simply returns the list of all CityBookings.
 */
router.get('/', function (req, res) {
	res.json(_.map(CityBookings.all().toArray(), function (model) {
		return model;
	}));
});


/** Lists of all citybookings with services.
 *
 * This function simply returns the list of CityBookings with services.
 */
router.post('/get-service-bookings-by-city-key', function (req, res) {
	let cityBookingKey = req.body.cityBookingKey;
	let result = CityBookings.getServiceBookings(cityBookingKey);
	// TEMP
	// if (result) {
	// 	result = require('../repositories/citybookings').TEMP_addDateToCityBooking(result);
	// 	result.cityDays = require('../repositories/cityday').TEMP_addDateToCityDays(result.cityDays);
	// }
	// END TEMP
	res.json(result);
})
	.body(require('../models/citybookingByKey'), 'The servicebookings you want to retrieve')
	.error(404, 'The citybooking could not be found');


/** Creates a new servicebookings.
 *
 * Creates a new servicebookings. The information has to be in the
 * requestBody.
 */
router.post('/create-service-bookings-from-cityKey-tourKey-array', function (req, res) {
	let tourKeys = req.body.tourKeys;
	let cityBookingKey = req.body.cityBookingKey;
	// let clientMutationId = req.body.clientMutationId;
	// delete req.body.clientMutationId;
	delete req.body.tourKeys;
	delete req.body.cityBookingKey;
	let result = CityBookings.saveTours(req.body, tourKeys, cityBookingKey);
	res.json(result);
})
    .body(require('../models/ServiceBookingsByTourKeyArray'), 'The tourbookings you want to create');


/** Creates a tourplan bookings.
 *
 * Creates a new tourplan bookings. The cityBookingKey has to be in the
 * requestBody.
 */
router.post('/create-tourplan-bookings-from-cityKey', function (req, res) {
	let cityBookingKey = req.body.cityBookingKey;
	let result = CityBookings.bookCityBookingToTourplan(cityBookingKey);
	res.json(result);
})
    .body(require('../models/citybookingByCityKey'), 'The cityBooking you want to book to tourplan.');

/** Removes a tourplan bookings.
 *
 * Remove tourplan bookings. The cityBookingKey has to be in the
 * requestBody.
 */
router.post('/remove-tourplan-bookings-from-cityKey', function (req, res) {
	let cityBookingKey = req.body.cityBookingKey;
	let result = CityBookings.removeCityBookingToTourplan(cityBookingKey);
	res.json(result);
})
    .body(require('../models/citybookingByCityKey'), 'The cityBooking you want to book to tourplan.');


/** Creates a new citybooking.
 *
 * Creates a new citybooking. The information has to be in the
 * requestBody.
 */
router.post('/', function (req, res) {
	let countryBookingKey = req.body.countryBookingKey;
	let cityCode = req.body.cityCode;

	let citybooking = req.body;
	let clientMutationId = citybooking.clientMutationId;
	let cityIndex = citybooking.cityIndex;
	delete citybooking.clientMutationId;
	delete citybooking.countryBookingKey;
	delete citybooking.cityIndex;

	let cityDay = CityDays.save({});
	let dayOrder = [];
	dayOrder.push(cityDay._key);
	citybooking.dayOrder = dayOrder;
	let result = CityBookings.save(citybooking);

	// Add cityBooking to locatedIn edge
	let aqlQuery = `
	LET foundLoc = FIRST(FOR location in locations
		FILTER location.name == @locationName
		RETURN location)

	INSERT {_from: CONCAT('cityBookings/', @cityBookingKey), _to: foundLoc._id} IN locatedIn
	RETURN foundLoc`;
	db._query(aqlQuery, {'locationName': cityCode, 'cityBookingKey': result._key}).next();

  CountryBookings.addCityBookingKeyToCountryBooking(countryBookingKey, result._key, cityIndex);
	addToEdge('countryBookings', countryBookingKey, 'cityBookings', result._key, 'bookIn', {label: "BookIn"});
	result.clientMutationId = clientMutationId;
	addToEdge('cityBookings', result._key, 'cityDays', cityDay._key, 'bookIn', {label: "BookIn"});

	if (result) {
	  CityBookings.TEMP_addDateToCityBooking(result);
	}

	res.json(result);
})
    .body(require('../models/citybooking'), 'The citybooking you want to create');


/** Reads a citybooking.
 *
 * Reads a citybooking.
 */
router.get('/:citybookingKey', function (req, res) {
	let citybookingKey = req.pathParams.citybookingKey;
	res.json(CityBookings.document(citybookingKey));
})
	.pathParam('citybookingKey', citybookingIdSchema)
    .error(404, 'The citybooking could not be found');

/** Replaces a citybooking.
 *
 * Changes a citybooking. The information has to be in the
 * requestBody.
 */
router.put('/:citybookingKey', function (req, res) {
	let citybookingKey = req.pathParams.citybookingKey;
	let citybooking = req.body;
	res.json(CityBookings.replace(citybookingKey, citybooking));
})
	.pathParam('citybookingKey', citybookingIdSchema)
    .body(require('../models/citybooking'), 'The citybooking you want your old one to be replaced with')
    .error(404, 'The citybooking could not be found');

/** Updates a citybooking.
 *
 * Changes a citybooking. The information has to be in the
 * requestBody.
 */
router.patch('/:citybookingKey', function (req, res) {
	let citybookingKey = req.pathParams.citybookingKey;
	let patchData = req.body;
	res.json(CityBookings.update(citybookingKey, patchData));
})
	.pathParam('citybookingKey', citybookingIdSchema)
    .body(joi.object().required(), 'The patch data you want your citybooking to be updated with')
    .error(404, 'The citybooking could not be found');

/** Removes a citybooking.
 *
 * Removes a citybooking.
 */
router.delete('/:citybookingKey', function (req, res) {
	let citybookingKey = req.pathParams.citybookingKey;
	CityBookings.remove(citybookingKey);
	res.json({success: true});
})
	.pathParam('citybookingKey', citybookingIdSchema)
    .error(404, 'The citybooking could not be found');

/** Tours in array.
 *
 * This function simply returns the list of tours that belongs to a cityBooking.
 */
router.post('/get-tours-by-city-key', function (req, res) {
	let cityBookingKey = req.parameters.citybooking.attributes.cityBookingKey;
	let result = CityBookings.getTours(cityBookingKey);
	res.json(result);
})
    .body(require('../models/citybookingByKey'), 'The tours you want to retrieve');

/** Patch Tours.
 *
 * This function simply patch tours in a cityBooking.
 */
router.post('/patch-tours-by-city-key', function (req, res) {
	let cityBookingKey = req.parameters.citybooking.attributes.cityBookingKey;
	let clientMutationId = req.parameters.citybooking.attributes.clientMutationId;
	delete req.parameters.citybooking.attributes.clientMutationId;
	let tourKeys = req.parameters.citybooking.attributes.tourKeys;
	let result = CityBookings.patchTours(cityBookingKey, tourKeys);
	result.clientMutationId = clientMutationId;
	res.json(result);
})
    .body(require('../models/citybookingpatchtour'), 'The tours you want to patch');


/**Check the availability of a serviceBookings by City bookings.
 *
 * Check the availability of a serviceBookings by City bookings.
 */
router.post('/check-services-availability', function (req, res) {
	const cityBookingKey = req.body.id;
	ServiceBookings.checkServicesAvailability(cityBookingKey);
	const cityBooking = CityBookings.getServiceBookings(cityBookingKey);
	const result = CityBookings.TEMP_addDateToCityBooking(cityBooking);
	res.json(result);
})
.body(require('../models/country_cityBookingId'), '');
