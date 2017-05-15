'use strict';
const joi = require('joi');

module.exports = joi.object({
  tripKey: joi.string()
}).required();
