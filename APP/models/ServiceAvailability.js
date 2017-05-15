'use strict';
const joi = require('joi');

module.exports = joi.object({
	clientMutationId: joi.string(),
	serviceBookingKey: joi.string()
}).required();
