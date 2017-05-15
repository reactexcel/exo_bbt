'use strict';

const router = require('@arangodb/foxx/router')();
module.exports = router;

const db = require('@arangodb').db;
// const request = require('@arangodb/request');
const _ = require('underscore');
const joi = require('joi');
const Proposals = require('../repositories/proposals');
// const Proposal = require('../models/proposal');
const utils = require('../utils.js');

const proposalIdSchema = joi.string().required()
	.description('The id of the proposal')
	.meta({allowMultiple: false});

/** Lists of all proposals.
 *
 * This function simply returns the list of all Proposal.
 */
router.get('/', function (req, res) {
	res.json(_.map(Proposals.all().toArray(), function (model) {
		return model;
	}));
});

/** Creates a new proposal.
 *
 * Creates a new proposal. The information has to be in the
 * requestBody.
 */
router.post('/', function (req, res) {
  const proposal = req.body;
  const clientMutationId = req.body.clientMutationId;
  delete proposal.clientMutationId;

  // Create a proposal
  const createdProposal = Proposals.save(proposal);
  createdProposal.clientMutationId = clientMutationId;

  //TODO: Remove these hard coded pax
  const nrPax = 10;
  for (let i = 0; i < nrPax; i++) {
  let pax = {};
  switch (i) {
    case 0: { pax = db.paxs.save({firstName: `John ${i + 1}`, lastName: 'Doe (A)', ageGroup: 'adults'});
	utils.addToEdge('proposals', createdProposal._key, 'paxs', pax._key, 'participate', {'mainPAX': true}); } break;
    case 2:
    case 3:
    case 6:
    case 7:
    case 8: { pax = db.paxs.save({firstName: `John ${i + 1}`, lastName: 'Doe (A)', ageGroup: 'adults'});
	utils.addToEdge('proposals', createdProposal._key, 'paxs', pax._key, 'participate'); } break;
    case 1:
    case 4: { pax = db.paxs.save({firstName: `John ${i + 1}`, lastName: 'Doe (I)', ageGroup: 'infants'});
	utils.addToEdge('proposals', createdProposal._key, 'paxs', pax._key, 'participate'); } break;
    case 5:
    case 9: { pax = db.paxs.save({firstName: `John ${i + 1}`, lastName: 'Doe (C)', ageGroup: 'children'});
	utils.addToEdge('proposals', createdProposal._key, 'paxs', pax._key, 'participate'); } break;
	default: { pax = db.paxs.save({firstName: `John ${i + 1}`, lastName: 'Doe (A)', ageGroup: 'adults'});
	utils.addToEdge('proposals', createdProposal._key, 'paxs', pax._key, 'participate'); } break;
	}
}
  res.json(createdProposal);
})
	.body(require('../models/proposal'), 'The proposal you want to create');


/** Reads a proposal.
 *
 * Reads a proposal.
 */
router.get('/:proposalKey', function (req, res) {
	let proposalKey = req.pathParams.proposalKey;
	res.json(Proposals.document(proposalKey));
})
	.pathParam('proposalKey', proposalIdSchema)
	.error(404, 'The proposal could not be found');

/** Replaces a proposal.
 *
 * Changes a proposal. The information has to be in the
 * requestBody.
 */
router.put('/:proposalKey', function (req, res) {
	let proposalKey = req.pathParams.proposalKey;
	let proposal = req.body;
	res.json(Proposals.replace(proposalKey, proposal));
})
	.pathParam('proposalKey', proposalIdSchema)
	.body(require('../models/proposal'), 'The proposal you want your old one to be replaced with')
	.error(404, 'The proposal could not be found');

/** Updates a proposal.
 *
 * Changes a proposal. The information has to be in the
 * requestBody.
 */
router.patch('/:proposalKey', function (req, res) {
	let proposalKey = req.pathParams.proposalKey;
	let patchData = req.body;
	res.json(Proposals.update(proposalKey, patchData));
})
	.pathParam('proposalKey', proposalIdSchema)
	.body(joi.object().required(), 'The patch data you want your proposal to be updated with')
	.error(404, 'The proposal could not be found');

/** Removes a proposal.
 *
 * Removes a proposal.
 */
router.delete('/:proposalKey', function (req, res) {
	let proposalKey = req.pathParams.proposalKey;
	Proposals.remove(proposalKey);
	res.json({success: true});
})
	.pathParam('proposalKey', proposalIdSchema)
	.error(404, 'The proposal could not be found');
