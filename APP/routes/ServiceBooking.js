'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

const db = require('@arangodb').db;
const _ = require('underscore');
const joi = require('joi');
const ServiceBookings = require('../repositories/servicebookings');
// const Trips = require('../repositories/trips');
const CityBookings = require('../repositories/citybookings');
// const Proposals = require('../repositories/proposals');
const addToEdge = require('../utils').addToEdge;
const removeCountryCode = require('../utils/serversAndCountries').removeCountryCode;
// const servers = require('../utils/serversAndCountries').servers;
const utils = require('../utils');

const servicebookingIdSchema = joi.string().required()
	.description('The id of the ServiceBooking')
	.meta({allowMultiple: false});

/*eslint global-require: 1*/
/*eslint new-cap: 1*/

/** Lists of all servicebookings.
 *
 * This function simply returns the list of all ServiceBookings.
 */
router.get('/', function (req, res) {
	res.json(_.map(ServiceBookings.all().toArray(), function (model) {
		return model;
	}));
});

/** Creates a new servicebooking.
 *
 * Creates a new servicebooking. The information has to be in the
 * requestBody.
 */
router.post('/', function (req, res) {
	let servicebooking = req.body;
	let tourKey = servicebooking.tourKey;
	delete servicebooking.tourKey;
	let clientMutationId = servicebooking.clientMutationId;
	delete servicebooking.clientMutationId;
	let cityDayKey = servicebooking.cityDayKey;
	delete servicebooking.cityDayKey;
	let result = ServiceBookings.save(servicebooking);
	addToEdge('cityDays', cityDayKey, 'serviceBookings', result._key, 'bookIn', {label: "BookIn"});
	addToEdge('serviceBookings', result._key, 'tours', tourKey, 'use', {label: "Use"});
	result.clientMutationId = clientMutationId;
	res.json(result);
})
	.body(require('../models/servicebooking'), 'The servicebooking you want to create');

/** Change day slot for servicebooking.
 *
 * Change day slot for servicebooking. The information has to be in the
 * requestBody.
 */
router.post('/change-service-day-slot', function (req, res) {
	let servicebooking = req.body;
	let serviceBookingKey = servicebooking.serviceBookingKey;
	delete servicebooking.serviceBookingKey;
	let clientMutationId = servicebooking.clientMutationId;
	delete servicebooking.clientMutationId;
	let cityDayKey = servicebooking.cityDayKey;
	delete servicebooking.cityDayKey;
	let startSlot = servicebooking.startSlot;
	delete servicebooking.startSlot;
	let cityBookingId = ServiceBookings.changeCityDaySlot(serviceBookingKey, cityDayKey, startSlot);
	let result = CityBookings.getServiceBookings(cityBookingId);
	result.clientMutationId = clientMutationId;
	// TEMP
	result.cityDays = require('../repositories/cityday').TEMP_addDateToCityDays(result.cityDays);
	// END TEMP
	res.json(result);
})
	.body(require('../models/changeServiceDaySlot'), 'The servicebooking you want to change');


/** Reads a servicebooking.
 *
 * Reads a servicebooking.
 */
router.post('/get-service-booking-by-key', function (req, res) {
	let serviceBookingKey = req.body.serviceBookingKey;
	let serviceBooking = ServiceBookings.getServiceBooking(serviceBookingKey);
	res.json(serviceBooking);
})
	.body(require('../models/servicebookingByKey'), 'The servicebooking you want to retrieve');

/**Create or update a servicebooking to Tourplan.
 *
 * Create or update a servicebooking to Tourplan.
 */

router.post('/create-update-tourplan-booking', function (req, res) {
	const serviceBookingKey = req.body.serviceBookingKey;
	const serviceBookingKeys = [];
	serviceBookingKeys.push(serviceBookingKey);
	const serviceBookingInfo = ServiceBookings.getBookingInfo(serviceBookingKeys);
	let batchResult = [];
	serviceBookingInfo.forEach((serviceBooking) => {
		const optionNumber = ServiceBookings.getOptionNumber(serviceBooking.serviceBookingKey);
		const params = {
			AgentID: 'uncircled',
			Password: 'kiril123',
			agentTPUID: 'user.agentTPUID',
			country: ServiceBookings.getCountry(serviceBooking.serviceBookingKey),
			OptionNumber: removeCountryCode(optionNumber),
			DateFrom: serviceBooking.startDay,
			SCUqty: serviceBooking.SCUqty
		};
		let tourplanBooking = ServiceBookings.bookServiceBookingToTourPlan(serviceBookingKey, params);
		batchResult.push(tourplanBooking);
		// batchResult.push(params);
	});
	res.json(batchResult);
})
.body(require('../models/tourplanCreateUpdate'), 'The servicebooking you want to book or update to tourplan');

/**Create or update a servicebookings to Tourplan.
 *
 * Create or update a servicebookings to Tourplan.
 */
router.post('/create-update-tourplan-bookings', function (req, res) {
	const serviceBookingKeys = req.body.serviceBookingKeys;
	const serviceBookingInfo = ServiceBookings.getBookingInfo(serviceBookingKeys);
	let batchResult = [];
	serviceBookingInfo.forEach((serviceBooking) => {
		const optionNumber = ServiceBookings.getOptionNumber(serviceBooking.serviceBookingKey);
		const params = {
			AgentID: 'uncircled',
			Password: 'kiril123',
			agentTPUID: 'user.agentTPUID',
			country: ServiceBookings.getCountry(serviceBooking.serviceBookingKey),
			OptionNumber: removeCountryCode(optionNumber),
			DateFrom: serviceBooking.startDay,
			SCUqty: serviceBooking.SCUqty
		};
		let tourplanBooking = ServiceBookings.bookServiceBookingToTourPlan(serviceBooking.serviceBookingKey, params);
		batchResult.push(tourplanBooking);
	});
	res.json(batchResult);
})
.body(require('../models/tourplanCreateUpdates'), 'The servicebooking you want to book or update to tourplan');

/**Check the availability of a serviceBookings by Country or City bookings.
 *
 * Check the availability of a serviceBookings by Country or City bookings.
 */
router.post('/check-services-availability', function (req, res) {
	const id = req.body.id;
	const result = ServiceBookings.checkServicesAvailability(id);
	res.json(result);
})
.body(require('../models/country_cityBookingId'), '');

/**Check the availability of a serviceBooking.
 *
 * Check the availability of a serviceBooking.
 */
router.post('/check-service-availability', function (req, res) {
	const serviceBookingKey = req.body.serviceBookingKey;
	const result = ServiceBookings.checkServiceAvailability(serviceBookingKey);
	ServiceBookings.updateServiceBooking(serviceBookingKey, {price: {currency: result.currency}});
	res.json(result);
})
  .body(require('../models/ServiceAvailability'), 'The product you want to check');

/** Remove a servicebooking from Tourplan.
 *
 * Remove a servicebooking from Tourplan.
 */
router.post('/remove-servicebooking-tourplan', function (req, res) {
	const serviceBookingKey = req.body.serviceBookingKey;
	let serviceBookingKeys = [];
	serviceBookingKeys.push(serviceBookingKey);
	let batchResult = [];
	serviceBookingKeys.forEach((_serviceBookingKey) => {
		let params = {
			AgentID: 'uncircled',
			Password: 'kiril123',
			serviceBookingId: 'serviceBookings/' + _serviceBookingKey,
			country: 'thailand'
		};
		let tourplanBooking = ServiceBookings.removeServiceBookingFromTourPlan(params);
		batchResult.push(tourplanBooking);
	});
	res.json(batchResult);
})
	.body(require('../models/cancelTourplanService'), 'The servicebooking you want to cancel in tourplan');

/** Remove multiple servicebookings from Tourplan.
 *
 * Remove multiple servicebookings from Tourplan.
 */
router.post('/remove-servicebookings-tourplan', function (req, res) {
	const serviceBookingKeys = req.body.serviceBookingKeys;
	let batchResult = [];
	serviceBookingKeys.forEach((serviceBookingKey) => {
		let params = {
			AgentID: 'uncircled',
			Password: 'kiril123',
			serviceBookingId: 'serviceBookings/' + serviceBookingKey,
			country: 'thailand'
		};
		let tourplanBooking = ServiceBookings.removeServiceBookingFromTourPlan(params);
		batchResult.push(tourplanBooking);
	});
	res.json(batchResult);
})
	.body(require('../models/cancelTourplanServices'), 'The servicebookings you want to cancel in tourplan');

/** Reads a servicebooking.
 *
 * Reads a servicebooking.
 */
router.get('/:servicebookingKey', function (req, res) {
	let servicebookingKey = req.pathParams.servicebookingKey;
	res.json(ServiceBookings.document(servicebookingKey));
})
	.pathParam('servicebookingKey', servicebookingIdSchema)
	.error(404, 'The servicebooking could not be found');

/** Replaces a servicebooking.
 *
 * Changes a servicebooking. The information has to be in the
 * requestBody.
 */
router.put('/:servicebookingKey', function (req, res) {
	let servicebookingKey = req.pathParams.servicebookingKey;
	let servicebooking = req.body;
	res.json(ServiceBookings.replace(servicebookingKey, servicebooking));
})
	.pathParam('servicebookingKey', servicebookingIdSchema)
	.body(require('../models/servicebooking'), 'The servicebooking you want your old one to be replaced with')
	.error(404, 'The servicebooking could not be found');

/** Updates a servicebooking.
 *
 * Changes a servicebooking. The information has to be in the
 * requestBody.
 */
router.patch('/:servicebookingKey', function (req, res) {
	let servicebookingKey = req.pathParams.servicebookingKey;
	let patchData = req.body.patchData;
	let clientMutationId = req.body.clientMutationId;
	delete req.body.clientMutationId;
	ServiceBookings.update(servicebookingKey, patchData);
	let result = ServiceBookings.document(servicebookingKey);
	result.clientMutationId = clientMutationId;
	res.json(result);
})
	.pathParam('servicebookingKey', servicebookingIdSchema)
	.body(joi.object().required(), 'The patch data you want your servicebooking to be updated with')
	.error(404, 'The servicebooking could not be found');

/** Removes a servicebooking.
 *
 * Removes a servicebooking.
 */
router.delete('/:servicebookingKey', function (req, res) {
	let servicebookingKey = req.pathParams.servicebookingKey;
	ServiceBookings.removeServiceBooking(servicebookingKey);
	res.json({status: 'OK', message: `servicebooking ${servicebookingKey} deleted`});
})
	.pathParam('servicebookingKey', servicebookingIdSchema)
	.error(404, 'The servicebooking could not be found');


/**
 * Update paxs
 */
router.put('paxs/:serviceBookingKey', (req, res) => {
	const {serviceBookingKey} = req.pathParams;
	const {paxKeys} = req.body;

	// Remove all pax edges, and recreate them based on the given pax ids
	db.participate.removeByExample({_from: `serviceBookings/${serviceBookingKey}`});
	paxKeys.forEach((paxKey) => {
		utils.addToEdge('serviceBookings', serviceBookingKey, 'paxs', paxKey, 'participate');
	});
	res.json(db.serviceBookings.firstExample({_key: serviceBookingKey}));
})
	.body(joi.object({serviceBookingKey: joi.string(), paxKeys: joi.array()}), 'Link from a serviceBooking to paxs');

/**Check the status of all PAX in a serviceBooking.
 *
 * Check the status of all PAX in a serviceBooking
 */
router.post('/check-pax-status', function (req, res) {
	let tripKey = req.body.tripKey;
	let cityDayKey = req.body.cityDayKey;
	let serviceBookingKey = req.body.serviceBookingKey;
	let paxList = ServiceBookings.checkPAXStatuses(tripKey, cityDayKey, serviceBookingKey);
	res.json(paxList);
})
	.body(require('../models/servicebookingcheckpax'), 'The serviceBooking you want to check PAX of');

