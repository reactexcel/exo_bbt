'use strict';
var joi = require('joi');

module.exports = joi.object({
    // Describe the attributes with joi here
    serviceBookingKey: joi.string(),
    cityDayKey: joi.string(),
    startSlot: joi.number().integer(),
    clientMutationId: joi.string()
}).required();