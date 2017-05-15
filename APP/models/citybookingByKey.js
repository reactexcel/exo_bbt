'use strict';
var joi = require('joi');

module.exports = joi.object({
    // Describe the attributes with joi here
    cityBookingKey: joi.string()
}).required();