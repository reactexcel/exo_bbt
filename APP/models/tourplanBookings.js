'use strict';
var joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	clientMutationId: joi.string(),
	serviceBookingKeys: joi.array(),
	paxlist: joi.array(joi.object()),
	tpparams: joi.object()
}).required();
