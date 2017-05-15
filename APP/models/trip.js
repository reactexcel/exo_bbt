'use strict';
const joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	tripKey: joi.string(),
	clientMutationId: joi.string(),
	proposalKey: joi.string(),
	name: joi.string(),
	startDate: joi.string(),
	endDate: joi.string(),
	duration: joi.number().integer(),
	notes: joi.string(),
	class: joi.number().integer(),
	style: joi.array(),
	occassion: joi.array(),
	preferredLanguage: joi.string(),
	status: joi.string()
}).required();
