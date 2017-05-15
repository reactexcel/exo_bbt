'use strict';
var joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	startTravelInCity: joi.string(),
	startTravelOnDate: joi.string(),
	travelDuration: joi.number().integer(),
	nrAdult: joi.number().integer(),
	nrChildren: joi.number().integer(),
	nrInfant: joi.number().integer(),
	notes: joi.string(),
	class: joi.number().integer().min(1).max(5),
	style: joi.array(),
	occasion: joi.array(),
	preferredLanguage: joi.string(),
	clientMutationId: joi.string()
}).required();