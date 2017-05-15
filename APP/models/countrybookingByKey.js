'use strict';
const joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	clientMutationId: joi.string(),
	countryBookingKey: joi.string()
}).required();
