'use strict';
var joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	tripKey: joi.string(),
	cityDayKey: joi.string(),
	serviceBookingKey: joi.string()
}).required();
