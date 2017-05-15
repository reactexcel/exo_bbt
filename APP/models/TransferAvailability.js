'use strict';
var joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	agentID: joi.string(),
	password: joi.string(),
	country: joi.string(),
	productIds: joi.array(joi.string()),
	date: joi.string(),
	nrOfAdults: joi.number().integer(),
	nrOfChildren: joi.number().integer(),
	nrOfInfants: joi.number().integer(),
	serviceBookingKeys: joi.array(joi.string())
}).required();
