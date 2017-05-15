'use strict';
var joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	tripKey: joi.string(),
	cityBookingKey: joi.string(),
	roomConfigKey: joi.string()
}).required();

