'use strict';
var joi = require('joi');

module.exports = joi.object({
    // Describe the attributes with joi here
    country: joi.string(),
    city: joi.string(),
    date: joi.string(),
    cityDayKey: joi.string(),
    officeKey: joi.string()
}).required();