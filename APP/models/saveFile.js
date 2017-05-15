'use strict';
const joi = require('joi');

module.exports = joi.object({
  contentBase64: joi.string(),
  saveToPath: joi.string(),
  saveToFileName: joi.string()
}).required();
