'use strict';
const joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	tripKey: joi.string(),
	clientMutationId: joi.string(),
	tree: joi.array()
}).required();
