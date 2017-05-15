'use strict';
const joi = require('joi');

const useLocal = false;
module.exports = joi.object({
    // Describe the attributes with joi here
    country: joi.string(),
    city: joi.string(),
    date: joi.string(),
    duration: joi.number().integer(),
    accommodationPlacementKey: joi.string(),
    useRemoteDataOnly: joi.boolean()
}).required();
