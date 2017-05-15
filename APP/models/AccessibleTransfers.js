'use strict';
const joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	origin: joi.string().length(3)
		.required(),
	destination: joi.string().length(3)
		.required(),
	dateFrom: joi.string()
}).required();
