'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

const request = require('@arangodb/request');
const _ = require('lodash');
const XMLMapping = require('xml-mapping');
const xmlescape = require('xml-escape');
const bbj2j = require('jsonapter');
const servers = require('../utils/serversAndCountries').servers;
const j2j = bbj2j.instance();
const utils = require('../utils');
const countryCodes = require('../utils/serversAndCountries').countryCodes;

function transformAvaliableResult(tpDoc, countryCode) {
	let template = {
		content: {
			productId: {
				value: _.get(tpDoc, 'OptionNumber.$t').concat(countryCode),
				existsWhen: _.partialRight(_.has, 'OptionNumber.$t')
			},
			productOptCode: {
				value: _.get(tpDoc, 'Opt.$t'),
				existsWhen: _.partialRight(_.has, 'Opt.$t')
			},
			availability: {
				value: _.get(tpDoc, 'OptStayResults.Availability.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.Availability.$t')
			},
			currency: {
				value: _.get(tpDoc, 'OptStayResults.Currency.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.Currency.$t')
			},
			totalPrice: {
				value: Number(_.get(tpDoc, 'OptStayResults.TotalPrice.$t')),
				existsWhen: _.partialRight(_.has, 'OptStayResults.TotalPrice.$t')
			},
			commissionPercent: {
				value: Number(_.get(tpDoc, 'OptStayResults.CommissionPercent.$t')),
				existsWhen: _.partialRight(_.has, 'OptStayResults.CommissionPercent.$t')
			},
			agentPrice: {
				value: Number(_.get(tpDoc, 'OptStayResults.AgentPrice.$t')),
				existsWhen: _.partialRight(_.has, 'OptStayResults.AgentPrice.$t')
			},
			rateId: {
				value: _.get(tpDoc, 'OptStayResults.RateId.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.RateId.$t')
			},
			rateName: {
				value: _.get(tpDoc, 'OptStayResults.RateName.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.RateName.$t')
			},
			rateText: {
				value: _.get(tpDoc, 'OptStayResults.RateText.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.RateText.$t')
			},
			cancelHours: {
				value: Number(_.get(tpDoc, 'OptStayResults.CancelHours.$t')),
				existsWhen: _.partialRight(_.has, 'OptStayResults.CancelHours.$t')
			},
			dateFrom: {
				value: _.get(tpDoc, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.DateFrom.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.DateFrom.$t')
			},
			dateTo: {
				value: _.get(tpDoc, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.DateTo.$t'),
				existsWhen: _.partialRight(_.has, 'OptStayResults.PeriodValueAdds.PeriodValueAdd.DateTo.$t')
			}
		}
	};
	let result = j2j.run(template, tpDoc);
	return result;
}

function getTourAvailability(requestXML, tourplanServerUrl, countryCode, useEscap) {
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
	let tour = null;
	if (json.Reply.OptionInfoReply.Option.length) {
		for (let i=0; i<json.Reply.OptionInfoReply.Option.length; i++) {
			tour = transformAvaliableResult(json.Reply.OptionInfoReply.Option[i], countryCode);
			if (tour) {
				tours.push(tour);
			}
		}
	} else if (json.Reply.OptionInfoReply.Option) {
		tour = transformAvaliableResult(json.Reply.OptionInfoReply.Option, countryCode);
		if (tour) {
			tours.push(tour);
		}
	}
	return tours;
}

/** Retrieves all tours availability from a city.
 *
 * Parameters: AgentId, Password, Country, CityCode, Date(YYYY-MM-DD), Nr of adults, Nr of children, Nr of infants
 */
router.get('/:AgentID/:Password/:Country/:CityCode/:Date/:NrOfAdults/:NrOfChildren/:NrOfInfants', function (req, res) {
	let agentid = req.pathParams.AgentID;
	let password = req.pathParams.Password;
	let country = req.pathParams.Country;
	let city = req.pathParams.CityCode;
	let date = req.pathParams.Date;
	let nrOfAdults = req.pathParams.NrOfAdults;
	let nrOfChildren = req.pathParams.NrOfChildren;
	let nrOfInfants = req.pathParams.NrOfInfants;
	const requestXML =
		`<?xml version='1.0'?>
    <!DOCTYPE Request SYSTEM 'hostConnect_3_10_000.dtd'>
    <Request>
      <OptionInfoRequest>
        <AgentID>${agentid}</AgentID>
        <Password>${password}</Password>
        <Opt>${city.toUpperCase()}PK????????????</Opt>
        <Info>S</Info>
        <DateFrom>${date}</DateFrom>
        <SCUqty>1</SCUqty>
        <RoomConfigs>
          <RoomConfig>
            <Adults>${nrOfAdults}</Adults>
            <Children>${nrOfChildren}</Children>
            <Infants>${nrOfInfants}</Infants>
            <RoomType>SG</RoomType>
          </RoomConfig>
        </RoomConfigs>
      </OptionInfoRequest>
    </Request>`;
	let result = getTourAvailability(requestXML, servers[country.toLowerCase()], countryCodes[country.toLowerCase()], false);
	res.json(result);
})
	.pathParam('AgentID', utils.tourAgentIDSchema)
	.pathParam('Password', utils.tourAgentPasswordSchema)
	.pathParam('Country', utils.tourcountrySchema)
	.pathParam('CityCode', utils.tourcitySchema)
	.pathParam('Date', utils.tourdateSchema)
	.pathParam('NrOfAdults', utils.tourNrOfAdultsSchema)
	.pathParam('NrOfChildren', utils.tourNrOfChildrenSchema)
	.pathParam('NrOfInfants', utils.tourNrOfInfantsSchema)
	.error(404, 'The tour could not be found');

