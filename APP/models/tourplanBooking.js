'use strict';
let joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	clientMutationId: joi.string(),
	serviceBookingKey: joi.string(),
	paxlist: joi.array(joi.object()),
	tpparams: joi.object()
}).required();
