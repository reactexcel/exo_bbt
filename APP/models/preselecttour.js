'use strict';
var joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	clientMutationId: joi.string(),
	cityDayKey: joi.string(),
	tourKey: joi.string(),
	isPreselected: joi.boolean(),
	startSlot: joi.number().integer()
}).required();