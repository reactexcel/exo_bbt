'use strict';
const joi = require('joi');

module.exports = joi.object({
  tripKey: joi.string(),
  showDayNotes: joi.boolean(),
  showImages: joi.boolean(),
  showDescriptions: joi.boolean(),
  showCategoryAmounts: joi.boolean(),
  showLineAmounts: joi.boolean(),
  localPath: joi.string()
}).required();
