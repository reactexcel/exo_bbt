'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

const db = require('@arangodb').db;
const request = require('@arangodb/request');
const XMLMapping = require('xml-mapping');
const xmlescape = require('xml-escape');
const _ = require('lodash');
const servers = require('../utils/serversAndCountries').servers;
const countryCodes = require('../utils/serversAndCountries').countryCodes;
const getAccessibleToursXML = require('../utils/tpXMLScripts').getAccessibleToursXML;

function addPromotion(resultArray, promotion) {
	let valueAddType = promotion.Type.Number;
	if (valueAddType>=1 && valueAddType <= 6) {
		resultArray.push({type: valueAddType, description: promotion.Description.$t});
	}
	return resultArray;
}

function addStayAndPay(rateText, promotions) {
	if (rateText.toUpperCase().includes('PAY') && rateText.toUpperCase().includes('STAY'))
	{
		let promotion = {type: 'PayStay', description: rateText};
		promotions.push(promotion);
	}
}

function addPromotions(tour, optRate, resultTour) {
	let promotions = Array();
	if (optRate.ValueAdds.length) {
		for (let i = 0; i < optRate.ValueAdds.length; i++) {
			addPromotion(promotions, optRate.ValueAdds[i].ValueAdd);
		}
	} else {
		addPromotion(promotions, optRate.ValueAdds.ValueAdd);
	}
	if (promotions.length > 0) {
		resultTour.promotions = promotions;
	}
	if (_.has(tour, 'OptRates.OptRate.RateText')) {
		addStayAndPay(optRate.RateText.$t, promotions);
	}
	//resultTour.hasPromotions = (promotions.length > 0) || tour.isPromotion;
	resultTour.hasPromotions = tour.isPromotion;
}

function getTour(tourId, countryCode) {
	let result = null;
	let _tourId = tourId.concat(countryCode);
	let aqlQuery = `FOR tour in @@collection
    FILTER tour.productId == "${_tourId}"
    RETURN tour`;
	let tours = db._query(aqlQuery, {'@collection': 'tours'}).toArray();
	if (tours) {
		result = tours[0];
	}
	return result;
}

function addRate(doc, optRate) {
	let rate = {name: optRate.RateName.$t, description: optRate.RateText.$t};
	doc.rate = rate;
}

function isPreselectedTour(tourId, cityDayKey, startSlot) {
	let aqlQuery = `
	FOR preselection IN preselect
    FILTER 
    	preselection._from == @from && 
    	preselection._to == @to &&
    	preselection.startSlot == @startSlot
		RETURN preselection`;
	let preselect = db._query(aqlQuery, {'from': cityDayKey, 'to': tourId, 'startSlot': startSlot}).toArray();
	return preselect.length > 0;
}

function getSpecificToursByOffice(officeKey) {
  if (!officeKey) {
    return [];
	}
  let toursIds = [];
  try {
    let aqlQuery = `
    FOR selection IN selectedFor
      FILTER selection._from == @from && selection.type == 'specific'
      RETURN selection._to`;
    toursIds = db._query(aqlQuery, {'from': `offices/${officeKey}`}).toArray();
  } catch (ex) {
    console.log('getSpecificToursByOffice data error', ex);
  }
  return toursIds;
}

function getTours(requestXML, tourplanServerUrl, countryCode, useEscap, cityDayKey, officeKey) {
  let tpReturn = request({
		method: 'post',
		url: tourplanServerUrl,
		body: requestXML,
		timeout: 120000
	});
	let xml = tpReturn.body;
	if (useEscap) {
		let ignore = '<>';
		xml = xmlescape(tpReturn.body, ignore);
	}
	let json = XMLMapping.load(xml, {nested: true});
	let tours = new Array();
	let specificToursIds = getSpecificToursByOffice(officeKey);
	if (json.Reply.OptionInfoReply.Option) {
		for (let i = 0; i < json.Reply.OptionInfoReply.Option.length; i++) {
			let tour = getTour(json.Reply.OptionInfoReply.Option[i].OptionNumber.$t, countryCode);
			if (tour) {
				let option = json.Reply.OptionInfoReply.Option[i];
				if (_.has(option, 'OptRates.OptRate.ValueAdds')) {
					addPromotions(tour, json.Reply.OptionInfoReply.Option[i].OptRates.OptRate, tour);
				} else {
					tour.hasPromotions = false;
				}
				addRate(tour, json.Reply.OptionInfoReply.Option[i].OptRates.OptRate);
				tour.isAgentSpecific = specificToursIds.includes(tour._id);
				if ((tour.durationSlots === 1) && (!tour.timeSlots.Evening.available)) {
					let afternoonTour = JSON.parse(JSON.stringify(tour));
					afternoonTour.timeSlots.Morning.available = false;
					afternoonTour.isPreselected = isPreselectedTour(tour._id, 'cityDays/' + cityDayKey, 2);
					afternoonTour.startSlot = 2;
					tours.push(afternoonTour);
					tour.timeSlots.Afternoon.available = false;
					tour.startSlot = 1;
					tour.isPreselected = isPreselectedTour(tour._id, 'cityDays/' + cityDayKey, 1);
				} else if (tour.timeSlots.Evening.available) {
					tour.isPreselected = isPreselectedTour(tour._id, 'cityDays/' + cityDayKey, 3);
					tour.startSlot = 3;
				} else {
					tour.isPreselected = isPreselectedTour(tour._id, 'cityDays/' + cityDayKey, 1);
					tour.startSlot = 1;
				}
				tours.push(tour);
			}
		}
	}
	return tours;
}

/** Retrieves accessible tours from local database.
 *
 * Retrieves accessible tours from local database.
 * The information has to be in the
 * requestBody.
 */
router.post('/', function (req, res) {
	let agentid = 'uncircled';
	let password = 'kiril123';
	let country = req.body.country;
	let city = req.body.city;
	let date = req.body.date;
	let cityDayKey = req.body.cityDayKey;
	let officeKey = req.body.officeKey;
	const requestAccessibleXML = getAccessibleToursXML(
		{
			agentid: agentid,
			password: password,
			city: city,
			date: date
		});
	let result = getTours(requestAccessibleXML, servers[country.toLowerCase()], countryCodes[country.toLowerCase()], false, cityDayKey, officeKey);
	res.json(result);
})
	.body(require('../models/accessibleTours'), 'Retrieve accessible tours');
