'use strict';
const joi = require('joi');

module.exports = joi.object({
  fileBase64: joi.string(),
  fileName: joi.string()
}).required();
