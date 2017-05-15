'use strict';
var joi = require('joi');

module.exports = joi.object({
    // Describe the attributes with joi here
    clientMutationId: joi.string(),
    cityBookingKey: joi.string(),
    durationNights: joi.number().integer(),
    startDay: joi.number().integer(),
    startDate : joi.string(),
    accommodationPlacementKey: joi.string(),
    selectedAccommodationKeys: joi.array(joi.string()),
    preselectedAccommodationKeys: joi.array(joi.string()),
    placeholders: joi.array(joi.string()),
    action: joi.string()
}).required();