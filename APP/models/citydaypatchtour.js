'use strict';
let joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	clientMutationId: joi.string(),
	cityDayKey: joi.string(),
	tourKeys: joi.array(joi.string()),
	placeholders: joi.array(joi.string())
}).required();
