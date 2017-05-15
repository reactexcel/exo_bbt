'use strict';
let joi = require('joi');

module.exports = joi.object({
    clientMutationId: joi.string(),
    serviceBookingKeys: joi.array().required()
}).required();

