'use strict';

const router = require('@arangodb/foxx/router')();
module.exports = router;

const db = require('@arangodb').db;
// const request = require('@arangodb/request');
const _ = require('underscore');
const joi = require('joi');
const moment = require('moment');
const Trips = require('../repositories/trips');
const {getTrips, addToEdge} = require('../utils');

const tripIdSchema = joi.string().required()
	.description('The id of the trip')
	.meta({allowMultiple: false});

/** Lists of all trips.
 *
 * This function simply returns the list of all Trip.
 */
router.get('/', function (req, res) {
  res.json(_.map(Trips.all().toArray(), function (model) {
    return model;
  }));
});

/** Lists of all Trips.
 *
 * This function simply returns the list of all Trip.
 */
router.post('/trips-from-proposal/', function (req, res) {
  const trip = req.body;
  const proposalKey = trip.attributes.proposalKey;
  const result = getTrips(proposalKey);
  res.json(result);
})
	.body(require('../models/trip'), 'The trip you want to create');

/** Creates a new trip.
 *
 * Creates a new trip and bind it to a proposal based on the given proposalKey
 */
router.post('/', function (req, res) {
  if (req.body.startDate) {
    req.body.startDate = moment(new Date(req.body.startDate)).format('YYYY-MM-DD');
  }
  const {proposalKey, startDate, status, trip = {startDate: startDate, status: status}} = req.body;
	// always clear the durationDays to 0 for new trip.
	trip.durationDays = 0;

  // Create a new trip
  const newTrip = db.trips.save(trip);

  // Add an edge between the proposal and the new trip
  addToEdge('proposals', proposalKey, 'trips', newTrip._key, 'bookIn');

  // Automatically create edges from trip to all the existing PAXs in the proposal
  const participateEdges = db.participate.byExample({_from: `proposals/${proposalKey}`}).toArray();
  participateEdges.forEach((p) => {
    db.participate.save({_from: newTrip._id, _to: p._to});
  });

  res.json(newTrip);
})
	.body(require('../models/trip'), 'The trip you want to create');

/** Reads a trip.
 *
 * Reads a trip.
 */
router.post('/trip-by-tripKey', function (req, res) {
  const tripKey = req.body.tripKey;
  const trip = Trips.getTrip(tripKey);
  res.json(trip);
})
	.body(require('../models/trip'), 'The trip you like to retrieve');

/** Reads a trip.
 *
 * Reads a trip.
 */
router.get('/:tripKey', function (req, res) {
  const tripKey = req.pathParams.tripKey;
  res.json(Trips.document(tripKey));
})
	.pathParam('tripKey', tripIdSchema)
	.error(404, 'The trip could not be found');

/** Replaces a trip.
 *
 * Changes a trip. The information has to be in the
 * requestBody.
 */
router.put('/:tripKey', function (req, res) {
  const tripKey = req.pathParams.tripKey;
  const trip = req.body;
  res.json(Trips.replace(tripKey, trip));
})
	.pathParam('tripKey', tripIdSchema)
	.body(require('../models/trip'), 'The trip you want your old one to be replaced with')
	.error(404, 'The trip could not be found');

/** Updates a trip.
 *
 * Changes a trip. The information has to be in the
 * requestBody.
 */
router.patch('/:tripKey', function (req, res) {
  const tripKey = req.pathParams.tripKey;
  const patchData = req.body;
  res.json(Trips.update(tripKey, patchData));
})
	.pathParam('tripKey', tripIdSchema)
	.body(joi.object().required(), 'The patch data you want your trip to be updated with')
	.error(404, 'The trip could not be found');

/** Removes a trip.
 *
 * Removes a trip.
 */
router.delete('/:tripKey', function (req, res) {
  const tripKey = req.pathParams.tripKey;
  Trips.remove(tripKey);
  res.json({success: true});
})
	.pathParam('tripKey', tripIdSchema)
	.error(404, 'The trip could not be found');

/** Creates a tourplan bookings.
 *
 * Creates a new tourplan bookings. The tripBookingKey has to be in the
 * requestBody.
 */
router.post('/create-tourplan-bookings-from-tripKey', function (req, res) {
	let tripBookingKey = req.body.tripBookingKey;
	let result = Trips.bookTripBookingToTourplan(tripBookingKey);
	res.json(result);
})
    .body(require('../models/tripByTripKey'), '');

/** Removes a tourplan bookings.
 *
 * Remove tourplan bookings. The tripBookingKey has to be in the
 * requestBody.
 */
router.post('/remove-tourplan-bookings-from-tripKey', function (req, res) {
	let tripBookingKey = req.body.tripBookingKey;
	let result = Trips.removeTripBookingToTourplan(tripBookingKey);
	res.json(result);
})
    .body(require('../models/tripByTripKey'), '');


/** Get Trip country city tree.
 *
 */
router.post('/get-trip-country-city-tree', function (req, res) {
	const tripKey = req.body.tripKey;
	const result = Trips.getTripCountryCityTree(tripKey);
	res.json(result);
})
    .body(require('../models/trip'), '');

/** Mutate Trip country city tree.
 *
 */
router.post('/mutate-trip-country-city-tree', function (req, res) {
	const tripKey = req.body.tripKey;
  const tree = req.body.tree;
	const result = Trips.mutateTripCountryCityTree(tripKey, tree);
  //console.log({tripKey: tripKey, tree: JSON.stringify(tree), clientMutationId: clientMutationId});
	res.json(result);
})
    .body(require('../models/mutateTripCountryCityTree'), '');

/** Recalculate a trip.
 *
 * Recalculate a trip.
 */
router.post('/recalculate-trip', function (req, res) {
  const tripKey = req.body.tripKey;
  const trip = Trips.updateStartDayAndDuration(tripKey);
  res.json(trip);
})
  .body(require('../models/tripKey'), 'The trip you like to recalculate');
