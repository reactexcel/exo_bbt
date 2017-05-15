'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

const db = require('@arangodb').db;
// const request = require('@arangodb/request');
const _ = require('underscore');
const joi = require('joi');
// const ArangoError = require('@arangodb').ArangoError;
const CountryBookings = require('../repositories/countrybookings');
const Trips = require('../repositories/trips');
const BookIn = require('../utils').addCountryBooking;
const ServiceBookings = require('../repositories/servicebookings');
// const addToEdge = require('../utils').addToEdge;
//const addCountryBookingKeyToTrip = require('../utils').addCountryBookingKeyToTrip;

const countrybookingIdSchema = joi.string().required()
	.description('The id of the CountryBooking')
	.meta({allowMultiple: false});

const serviceBookingIdSchema = joi.string().required()
	.description('The id of the ServiceBooking')
	.meta({allowMultiple: false});

/*eslint global-require: 1*/
/*eslint new-cap: 1*/

/** Lists of all countrybookings.
 *
 * This function simply returns the list of all CountryBookings.
 */
router.get('/', function (req, res) {
	res.json(_.map(CountryBookings.all().toArray(), function (model) {
		return model;
	}));
});

/** Lists of all countrybookings with services.
 *
 * This function simply returns the list of CountryBookings with services.
 */
router.post('/get-service-bookings-by-country-key', function (req, res) {
	let countryBookingKey = req.body.countryBookingKey;
	let result = CountryBookings.getServiceBookings(countryBookingKey);
	// TEMP
	// if (result) {
	// 	result = require('../repositories/countrybookings').addDateToCityBookings(result);
	// 	result.cityBookings = require('../repositories/citybookings').TEMP_addDateToCityBookings(result.cityBookings);
	// 	result.cityBookings.forEach((c) => {
	// 		c.cityDays = require('../repositories/cityday').TEMP_addDateToCityDays(c.cityDays);
	// 	});
	// }
	// END TEMP
	res.json(result);
})
	.body(require('../models/countrybookingByKey'), 'The countrybookings you want to retrieve');

/** Creates a new countrybooking.
 *
 * Creates a new countrybooking. The information has to be in the
 * requestBody.
 */
router.post('/', function (req, res) {
	let tripKey = req.body.tripKey;
	let countryCode = req.body.countryCode;
	let countrybooking = req.body;
	delete countrybooking.tripKey;
	let clientMutationId = countrybooking.clientMutationId;
	delete countrybooking.clientMutationId;
	let result = CountryBookings.save(countrybooking);

	// Add countryBooking to locatedIn edge
	let aqlQuery = `
	LET foundLoc = FIRST(FOR location in locations
    FILTER location.name == @locationName
    RETURN location)

	INSERT {_from: CONCAT('countryBookings/', @countryBookingKey), _to: foundLoc._id} IN locatedIn
	RETURN foundLoc`;
	db._query(aqlQuery, {'locationName': countryCode, 'countryBookingKey': result._key}).next();

	Trips.addCountryBookingKeyToTrip(tripKey, result._key);
	BookIn(tripKey, result._key, {label: "BookIn"});
	result.clientMutationId = clientMutationId;
	res.json(result);
})
	.body(require('../models/countrybooking'), 'The countrybooking you want to create');

/** Reads a countrybooking.
 *
 * Reads a countrybooking.
 */
router.get('/:countrybookingKey', function (req, res) {
	let countrybookingKey = req.pathParams.countrybookingKey;
	res.json(CountryBookings.document(countrybookingKey));
})
	.pathParam('countrybookingKey', countrybookingIdSchema)
	.error(404, 'The countrybooking could not be found');

router.get('/byServiceBooking/:serviceBookingKey', function (req, res) {
	let serviceBookingKey = req.pathParams.serviceBookingKey;
	let aqlQuery = `
	  LET serviceBookingId = CONCAT('serviceBookings/', @serviceBookingKey)
	  FOR countryBooking IN 3..3 INBOUND serviceBookingId GRAPH 'exo-dev'
    	FILTER IS_SAME_COLLECTION('countryBookings', countryBooking)
    	RETURN countryBooking`;
	res.json(db._query(aqlQuery, {serviceBookingKey}).toArray());
})
	.pathParam('serviceBookingKey', serviceBookingIdSchema)
	.error(404, 'The countrybooking could not be found');

/** Replaces a countrybooking.
 *
 * Changes a countrybooking. The information has to be in the
 * requestBody.
 */
router.put('/:countrybookingKey', function (req, res) {
	let countrybookingKey = req.pathParams.countrybookingKey;
	let countrybooking = req.body;
	res.json(CountryBookings.replace(countrybookingKey, countrybooking));
})
	.pathParam('countrybookingKey', countrybookingIdSchema)
	.body(require('../models/countrybooking'), 'The countrybooking you want your old one to be replaced with')
	.error(404, 'The countrybooking could not be found');

/** Updates a countrybooking.
 *
 * Changes a countrybooking. The information has to be in the
 * requestBody.
 */
router.patch('/:countrybookingKey', function (req, res) {
	let countrybookingKey = req.pathParams.countrybookingKey;
	let patchData = req.body;
	res.json(CountryBookings.update(countrybookingKey, patchData));
})
	.pathParam('countrybookingKey', countrybookingIdSchema)
	.body(joi.object().required(), 'The patch data you want your countrybooking to be updated with')
	.error(404, 'The countrybooking could not be found');

/** Removes a countrybooking.
 *
 * Removes a countrybooking.
 */
router.delete('/:countrybookingKey', function (req, res) {
	let countrybookingKey = req.pathParams.countrybookingKey;
	CountryBookings.remove(countrybookingKey);
	res.json({success: true});
})
	.pathParam('countrybookingKey', countrybookingIdSchema)
	.error(404, 'The countrybooking could not be found');

/** Creates a tourplan bookings.
 *
 * Creates a new tourplan bookings. The countryBookingKey has to be in the
 * requestBody.
 */
router.post('/create-tourplan-bookings-from-countryKey', function (req, res) {
	let countryBookingKey = req.body.countryBookingKey;
	let result = CountryBookings.bookCountryBookingToTourplan(countryBookingKey);
	res.json(result);
})
    .body(require('../models/countrybookingByKey'), '');

/** Removes a tourplan bookings.
 *
 * Remove tourplan bookings. The cityBookingKey has to be in the
 * requestBody.
 */
router.post('/remove-tourplan-bookings-from-countryKey', function (req, res) {
	let countryBookingKey = req.body.countryBookingKey;
	let result = CountryBookings.removeCountryBookingToTourplan(countryBookingKey);
	res.json(result);
})
    .body(require('../models/countrybookingByKey'), '');

/**Check the availability of a serviceBookings by Country bookings.
 *
 * Check the availability of a serviceBookings by Country bookings.
 */
router.post('/check-services-availability', function (req, res) {
	const countryBookingKey = req.body.id;
	ServiceBookings.checkServicesAvailability(countryBookingKey);
	const countryBooking = CountryBookings.getServiceBookings(countryBookingKey);
	const result = CountryBookings.TEMP_addDateToCountryBooking(countryBooking);
	res.json(result);
})
.body(require('../models/country_cityBookingId'), '');
