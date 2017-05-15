'use strict';
const joi = require('joi');

module.exports = joi.object({
  roomConfigKey: joi.string()
}).required();
