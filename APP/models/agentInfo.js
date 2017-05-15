'use strict';
const joi = require('joi');

module.exports = joi.object({
	AgentID: joi.string().required(),
	Password: joi.string().required(),
	GenericSource: joi.boolean().required()
}).required();
