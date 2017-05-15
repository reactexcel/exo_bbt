'use strict';
const joi = require('joi');

module.exports = joi.object({
	serviceBookingKey: joi.string()
}).required();
