'use strict';
const joi = require('joi');

module.exports = joi.object({
	tripBookingKey: joi.string(),
	clientMutationId: joi.string()
}).required();
