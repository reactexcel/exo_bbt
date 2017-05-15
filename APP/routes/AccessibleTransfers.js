'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

const db = require('@arangodb').db;
const _ = require('lodash');
const request = require('@arangodb/request');
const AccessibleTransfers = require('../models/AccessibleTransfers');
const servers = require('../utils/serversAndCountries').servers;
const countryCode = require('../utils/serversAndCountries').countryCodes;
const xmlescape = require('xml-escape');
const XMLMapping = require('xml-mapping');

function getXML(user, pass, origin, type, dateFrom) {
	let resultXML = `<?xml version="1.0"?>
  <!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
  <Request>
  <OptionInfoRequest>
    <AgentID>${user}</AgentID>
    <Password>${pass}</Password>
    <Opt>${origin}${type}????????????</Opt>
    <Info>GT</Info>
  </OptionInfoRequest>
</Request>`;
	if (dateFrom) {
		// console.log(type, dateFrom);
		resultXML = `<?xml version="1.0"?><!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
  		<Request>
  			<OptionInfoRequest>
    			<AgentID>${user}</AgentID>
    			<Password>${pass}</Password>
    			<Opt>${origin}${type}????????????</Opt>
    			<Info>R</Info>
					<DateFrom>${dateFrom}</DateFrom>
					<SCUqty>1</SCUqty>
  			</OptionInfoRequest>
			</Request>`;
	}
	return resultXML;
}

function addTransferKeys(serverUrl, user, pass, bodyXMLType, countryCode, origin, dateFrom) {
	let tpReturn = request({
		method: 'post',
		url: serverUrl,
		body: getXML(user, pass, origin, bodyXMLType, dateFrom),
		timeout: 60000
	});
	let result = [];
	// let ignore = '<>';
	// let xml = xmlescape(tpReturn.body, ignore);
	let xml = tpReturn.body;
	let json = XMLMapping.load(xml, {nested: true});
	if (_.has(json, 'Reply.OptionInfoReply.Option')) {
		for (let i = 0; i < json.Reply.OptionInfoReply.Option.length; i++) {
			let option = json.Reply.OptionInfoReply.Option[i];
			result.push(_.get(option, 'OptionNumber.$t').concat(countryCode));
		}
	} else {
		console.log('JSON: ', JSON.stringify(json));
	}
	return result;
}

function queryTransfers(accTransfers, origin, destination) {
	let aqlQuery = `
		FOR accTransfer IN @accTransfers
			LET transferId = accTransfer
			FOR transfer IN transfers
				FILTER transfer._key == transferId &&
							transfer.route.from.cityCode == @origin &&
							transfer.route.to.cityCode == @destination
				RETURN transfer`;
	return db._query(aqlQuery, {accTransfers: accTransfers, origin: origin, destination: destination}).toArray();
}

router.post('/', function(req, res) {
	let agentid = 'uncircled';
	let password = 'kiril123';
	let accessibleTransfers = [];
	let origin = req.body.origin.toUpperCase();
	let destination = req.body.destination.toUpperCase();
	let dateFrom = req.body.dateFrom;
	accessibleTransfers = accessibleTransfers.concat(addTransferKeys(servers.thailand, agentid, password, 'TF', countryCode.thailand, origin, dateFrom));
	accessibleTransfers = accessibleTransfers.concat(addTransferKeys(servers.thailand, agentid, password, 'TP', countryCode.thailand, origin, dateFrom));
	accessibleTransfers = accessibleTransfers.concat(addTransferKeys(servers.thailand, agentid, password, 'FL', countryCode.thailand, origin, dateFrom));
	accessibleTransfers = accessibleTransfers.concat(addTransferKeys(servers.thailand, agentid, password, 'BO', countryCode.thailand, origin, dateFrom));

	res.json(queryTransfers(accessibleTransfers, origin, destination));
})
	.body(AccessibleTransfers, 'Retrieve accessible transfers');
