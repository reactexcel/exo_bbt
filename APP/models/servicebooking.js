'use strict';
var joi = require('joi');

module.exports = joi.object({
	// Describe the attributes with joi here
	cityDayKey: joi.string(),
	clientMutationId: joi.string(),
	tourKey: joi.string(),
	productId: joi.string(),
	serviceSequenceNumber: joi.number().integer(),
	serviceLineId: joi.number().integer(),
	availabilityStatus: joi.string(),
	bookingStatus: joi.string(),
	price: joi.object({
		currency: joi.string(),
		amount: joi.number()
	}),
	rate: joi.object({
		id: joi.string(),
		name: joi.string(),
		description: joi.string()
	}),
	dateFrom: joi.string(),
	dateTo: joi.string(),
	numberOfNights: joi.number().integer(),
	startDay: joi.number().integer(),
	startSlot: joi.number().integer(),
	durationSlots: joi.number().integer(),
	cancelHours: joi.number().integer(),
	pickUp: joi.object({
		time: joi.string(),
		location: joi.string(),
		remarks: joi.string()
	}),
	dropOff: joi.object({
		time: joi.string(),
		location: joi.string(),
		remarks: joi.string()
	}),
	longDistanceOption: joi.boolean(),
	earlyCheckin: joi.object({
		requested: joi.boolean(),
		comments: joi.string()
	}),
	lateCheckout: joi.object({
		requested: joi.boolean(),
		comments: joi.string()
	}),
	comment: joi.string(),
	remarks: joi.string(),
	notes: joi.string(),
	roomConfigs: joi.array(joi.object({
		roomType: joi.string(),
		paxList: joi.array(joi.object({
			tpPaxId:  joi.number().integer(),
			paxID:  joi.number().integer(),
			ageGroup: joi.string()
		}))
	})),
	bookedExtras: joi.array(joi.object({
		sequenceNumber: joi.number().integer(),
		quantity: joi.number().integer()
	}))
}).required();
