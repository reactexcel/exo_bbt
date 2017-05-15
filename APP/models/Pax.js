'use strict';
const joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	firstName: joi.string(),
	lastName: joi.string(),
	passportNr: joi.string(),
	passportImage: joi.string(),
	DOB: joi.string(),
	nationality: joi.string(),
	passportExpirationDate: joi.string(),
	passportDateOfIssue: joi.string(),
	gender: joi.string(),
	dietaryPrefereces: joi.array(),
	allergies: joi.array(),
	notes: joi.string()
}).required();
