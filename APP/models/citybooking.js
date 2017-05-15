'use strict';
var joi = require('joi');

module.exports = joi.object({
    // Describe the attributes with joi here
    cityCode: joi.string(),
    startDay: joi.number().integer(),
    durationNights: joi.number().integer(),
    cityIndex: joi.number().integer(),
    countryBookingKey: joi.string(),
    clientMutationId: joi.string()
}).required();