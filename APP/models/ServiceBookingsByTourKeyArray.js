'use strict';
var joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	clientMutationId: joi.string(),
	cityBookingKey: joi.string(),
	tourKeys: joi.array(joi.string())
}).required();