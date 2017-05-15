'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

//const db = require('@arangodb').db;
// const request = require('@arangodb/request');
// const servers = require('../utils/serversAndCountries').servers;
// const utils = require('../utils');
// const XMLMapping = require('xml-mapping');
// const xmlescape = require('xml-escape');
// const _ = require('lodash');
// const bbj2j = require('jsonapter');
// const TourAvailability = require('../models/TourAvailability');
// const countryCode = require('../utils/serversAndCountries').countryCodes;
// const removeCountryCode = require('../utils/serversAndCountries').removeCountryCode;
// const getTourAvailabilityXML = require('../utils/tpXMLScripts').getTourAvailabilityXML;
const ServiceBookings = require('../repositories/servicebookings');
// const j2j = bbj2j.instance();

// function addPromotion(resultArray, promotion) {
// 	let valueAddType = promotion.Type.Number;
// 	if (valueAddType>=1 && valueAddType <= 6) {
// 		resultArray.push({type: valueAddType, description: promotion.Description.$t})
// 	}
// 	return resultArray;
// }

// function addStayAndPay(stay, pay, promotions) {
// 	let promotion = {type: 'PayStay', description: `Stay ${stay} / Pay ${pay}`};
// 	promotions.push(promotion);
// }

// function addPromotions(tpDoc, valueAdds, resultTour) {
// 	let promotions = Array();
// 	if (valueAdds.length) {
// 		for (let i = 0; i < valueAdds.length; i++) {
// 			addPromotion(promotions, valueAdds[i].ValueAdd);
// 			// console.log(valueAdds[i].ValueAdd.Type.Number);
// 		}
// 	} else {
// 		addPromotion(promotions, valueAdds.ValueAdd);
// 	}
// 	if (promotions.length > 0) {
// 		resultTour.promotions = promotions;
// 	}
// 	if ((_.has(tpDoc, 'OptStayResults.Stay')) && (_.has(tpDoc, 'OptStayResults.Pay'))) {
// 		addStayAndPay(OptStayResults.Stay.$t, OptStayResults.Pay.$t, promotions);
// 	}
// 	resultTour.hasPromotions = promotions.length > 0;
// }

// function transformAvailableResult(tpDoc, countryCode) {
// 	let template = {
// 		content: {
// 			productId: {
// 				value: _.get(tpDoc, 'OptionNumber.$t').concat(countryCode),
// 				existsWhen: _.partialRight(_.has, 'OptionNumber.$t')
// 			},
// 			productOptCode: {
// 				value: _.get(tpDoc, 'Opt.$t'),
// 				existsWhen: _.partialRight(_.has, 'Opt.$t')
// 			},
// 			availability: {
// 				value: _.get(tpDoc, 'OptStayResults.Availability.$t'),
// 				existsWhen: _.partialRight(_.has, 'OptStayResults.Availability.$t')
// 			},
// 			currency: {
// 				value: _.get(tpDoc, 'OptStayResults.Currency.$t'),
// 				existsWhen: _.partialRight(_.has, 'OptStayResults.Currency.$t')
// 			},
// 			totalPrice: {
// 				value: Number(_.get(tpDoc, 'OptStayResults.TotalPrice.$t')),
// 				existsWhen: _.partialRight(_.has, 'OptStayResults.TotalPrice.$t')
// 			},
// 			commissionPercent: {
// 				value: Number(_.get(tpDoc, 'OptStayResults.CommissionPercent.$t')),
// 				existsWhen: _.partialRight(_.has, 'OptStayResults.CommissionPercent.$t')
// 			},
// 			agentPrice: {
// 				value: Number(_.get(tpDoc, 'OptStayResults.AgentPrice.$t')),
// 				existsWhen: _.partialRight(_.has, 'OptStayResults.AgentPrice.$t')
// 			},
// 			rateId: {
// 				value: _.get(tpDoc, 'OptStayResults.RateId.$t'),
// 				existsWhen: _.partialRight(_.has, 'OptStayResults.RateId.$t')
// 			},
// 			rateName: {
// 				value: _.get(tpDoc, 'OptStayResults.RateName.$t'),
// 				existsWhen: _.partialRight(_.has, 'OptStayResults.RateName.$t')
// 			},
// 			rateText: {
// 				value: _.get(tpDoc, 'OptStayResults.RateText.$t'),
// 				existsWhen: _.partialRight(_.has, 'OptStayResults.RateText.$t')
// 			},
// 			cancelHours: {
// 				value: Number(_.get(tpDoc, 'OptStayResults.CancelHours.$t')),
// 				existsWhen: _.partialRight(_.has, 'OptStayResults.CancelHours.$t')
// 			},
// 			dateFrom: {
// 				value: _.get(tpDoc, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.DateFrom.$t'),
// 				existsWhen: _.partialRight(_.has, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.DateFrom.$t')
// 			},
// 			dateTo: {
// 				value: _.get(tpDoc, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.DateTo.$t'),
// 				existsWhen: _.partialRight(_.has, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.DateTo.$t')
// 			}
// 		}
// 	};
// 	let result = j2j.run(template, tpDoc);
// 	if (_.has(tpDoc, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.ValueAdds')) {
// 		addPromotions(tpDoc, tpDoc.OptStayResults.PeriodValueAdds.PeriodValueAdd.ValueAdds, result);
// 	}
// 	return result;
// }

// function getTourAvailability(requestXML, tourplanServerUrl, countryCode, useEscap) {
// 	let tour = {"availability": "NO"};
// 	let tpReturn = request({
// 		method: 'post',
// 		url: tourplanServerUrl,
// 		body: requestXML,
// 		timeout: 120000
// 	});
// 	let xml = tpReturn.body;
// 	if (useEscap) {
// 		let ignore = '<>';
// 		xml = xmlescape(tpReturn.body, ignore);
// 	}
// 	let json = XMLMapping.load(xml, {nested: true});
// 	if (json.Reply.OptionInfoReply.Option) {
// 		tour = transformAvailableResult(json.Reply.OptionInfoReply.Option, countryCode);
// 	}
// 	return tour;
// }

/** Retrieves a tour availability from OptionNumber.
 *
 * Retrieves a tour availability from OptionNumber.
 * The information has to be in the
 * requestBody.
 */
// router.post('/old', function (req, res) {
// 	const agentid = 'uncircled';
// 	const password = 'kiril123';
// 	const productId = removeCountryCode(req.body.productId);
// 	const country = req.body.country;
// 	const date = req.body.date;
// 	const nrOfAdults = req.body.nrOfAdults;
// 	const nrOfChildren = req.body.nrOfChildren;
// 	const nrOfInfants = req.body.nrOfInfants;
// 	const serviceBookingKey = req.body.serviceBookingKey;

// 	const requestAvailableXML = getTourAvailabilityXML({
// 		agentid: agentid,
// 		password: password,
// 		productId: productId,
// 		date: date,
// 		nrOfAdults: nrOfAdults,
// 		nrOfChildren: nrOfChildren,
// 		nrOfInfants: nrOfInfants
// 	});

// 	let result = getTourAvailability(requestAvailableXML, servers[country.toLowerCase()], countryCode[country.toLowerCase()], false);
// 	ServiceBookings.updateServiceBooking(serviceBookingKey, {price: {currency: result.currency}});
// 	res.json(result);
// })
// 	.body(require('../models/TourAvailability'), 'The product you want to check');


router.post('/', function (req, res) {
	const serviceBookingKey = req.body.serviceBookingKey;
	const result = ServiceBookings.checkServiceAvailability(serviceBookingKey);
	ServiceBookings.updateServiceBooking(serviceBookingKey, {price: {currency: result.currency}});
	res.json(result);
})
  .body(require('../models/ServiceAvailability'), 'The product you want to check');
