'use strict';
var joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	countryCode: joi.string(),
	qpBookingId: joi.number().integer(),
	tpBookingId: joi.number().integer(),
	tpBookingRef: joi.number().integer(),
	cities: joi.array(joi.number().integer()),
	createdBy: joi.string(),
	createdOn: joi.string(),
	dateFrom: joi.string(),
	totalPrice: joi.number(),
	currency: joi.string(),
	notes: joi.string(),
	tripKey: joi.string(),
	clientMutationId: joi.string()
}).required();