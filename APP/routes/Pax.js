'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

const db = require('@arangodb').db;
// const request = require('@arangodb/request');
const _ = require('underscore');
const joi = require('joi');
const PAXs = require('../repositories/Pax');

const paxIdSchema = joi.string().required()
	.description('The id of the PAX')
	.meta({allowMultiple: false});

/** Lists of all paxs.
 *
 * This function simply returns the list of all PAXs.
 */
router.get('/', function (req, res) {
	res.json(_.map(PAXs.all().toArray(), function (model) {
		return model;
	}));
});

/** Creates a new pax.
 *
 * Creates a new pax. The information has to be in the
 * requestBody.
 */
router.post('/', function (req, res) {
	let pax = req.body;
	res.json(PAXs.save(pax));
})
	.body(require('../models/Pax'), 'The pax you want to create');


/** Reads a pax.
 *
 * Reads a pax.
 */
router.get('/:paxKey', function (req, res) {
	let paxKey = req.pathParams.paxKey;
	res.json(PAXs.document(paxKey));
})
	.pathParam('paxKey', paxIdSchema)
	.error(404, 'The pax could not be found');

/** Replaces a pax.
 *
 * Changes a pax. The information has to be in the
 * requestBody.
 */
router.put('/:paxKey', function (req, res) {
	let paxKey = req.pathParams.paxKey;
	let pax = req.parameters.pax;
	res.json(PAXs.replace(paxKey, pax));
})
	.pathParam('paxKey', paxIdSchema)
	.body(require('../models/Pax'), 'The pax you want your old one to be replaced with')
	.error(404, 'The pax could not be found');

/** Updates a pax.
 *
 * Changes a pax. The information has to be in the
 * requestBody.
 */
router.patch('/:paxKey', function (req, res) {
	let paxKey = req.pathParams.paxKey;
	let patchData = req.body;
	res.json(PAXs.update(paxKey, patchData));
})
	.pathParam('paxKey', paxIdSchema)
	.body(joi.object().required(), 'The patch data you want your pax to be updated with')
	.error(404, 'The pax could not be found');

/** Removes a pax.
 *
 * Removes a pax.
 */
router.delete('/:paxKey', function (req, res) {
	let paxKey = req.pathParams.paxKey;
	PAXs.remove(paxKey);
	res.json({success: true});
})
	.pathParam('paxKey', paxIdSchema)
	.error(404, 'The pax could not be found');

router.post('/get-paxs-by-proposalkey-tripkey', (req, res) => {
	const {proposalKey, tripKey} = req.body;
  if (proposalKey) {
    return res.json(PAXs.getPaxsByKey('proposals', proposalKey));
  }
  return res.json(PAXs.getPaxsByKey('trips', tripKey));
}).body(require('../models/paxs'), 'The pax you want to fetch');


router.post('/get-paxs-by-servicebookingkey', (req, res) => {
	const {serviceBookingKey} = req.body;
	let paxIds = db.participate.byExample({_from: `serviceBookings/${serviceBookingKey}`}).toArray().map((edge) => edge._to);
	res.json(db.paxs.document(paxIds));
}).body(require('../models/paxs'), 'The pax you want to fetch');

router.post('/get-paxs-by-roomconfigkey', (req, res) => {
	const {roomConfigKey} = req.body;
	let paxIds = db.participate.byExample({_from: `roomConfigs/${roomConfigKey}`}).toArray().map((edge) => edge._to);
	res.json(db.paxs.document(paxIds));
}).body(require('../models/paxs'), 'The pax you want to fetch');

router.post('/get-paxs-errors-by-roomconfigkey', (req, res) => {
	const {roomConfigKey} = req.body;
	const aqlGetErrors = `
		LET roomConfigId = CONCAT('roomConfigs/', @roomConfigKey)
		FOR pax, errorEdge IN 1..1 OUTBOUND roomConfigId GRAPH 'exo-dev' 
  		FILTER IS_SAME_COLLECTION('error', errorEdge)
		RETURN MERGE(pax, {paxError: {id: errorEdge._id, severity: errorEdge.severity, message: errorEdge.message, errorType: errorEdge.errorType}})`;
	const result = db._query(aqlGetErrors, {roomConfigKey}).toArray();
	res.json(result);
}).body(require('../models/paxs'), 'The pax you want to fetch');
