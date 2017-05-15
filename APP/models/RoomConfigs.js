'use strict';
const joi = require('joi');

module.exports = joi.object({
  serviceBookingKey: joi.string(),
  roomType: joi.string(),
  paxKeys: joi.array(),
  clientMutationId: joi.string()
}).required();
