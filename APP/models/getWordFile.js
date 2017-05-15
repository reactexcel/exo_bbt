'use strict';
const joi = require('joi');

module.exports = joi.object({
  dir: joi.string().default('../www/docs')
}).required();
