'use strict';
const joi = require('joi');

module.exports = joi.object({
  conversionID: joi.string()
}).required();
