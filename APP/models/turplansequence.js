'use strict';
const joi = require('joi');

module.exports = joi.object({
	all: joi.boolean(),
	bookingIdList: joi.array(joi.string())
}).required();
