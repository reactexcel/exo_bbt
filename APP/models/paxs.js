'use strict';
const joi = require('joi');

module.exports = joi.object({
  proposalKey: joi.string(),
	tripKey: joi.string(),
	serviceBookingKey: joi.string(),
	roomConfigKey: joi.string()
}).required();
