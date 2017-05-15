'use strict';
let request = require('@arangodb/request');
let _ = require('lodash');
let XMLMapping = require('xml-mapping');
let xmlescape = require('xml-escape');

let servers = {
	thailand: 'http://thailand-xml.exotravel.com:8080/iComTest/servlet/conn',
	vietnam: 'http://vietnam-xml.exotravel.com:8080/iComTest/servlet/conn',
	cambodia: 'http://cambodia-xml.exotravel.com:8080/iComTest/servlet/conn',
	indonesia: 'http://indonesia-xml.exotravel.com:8080/iComLive/servlet/conn',
	japan: 'http://japan-xml.exotravel.com:38080/iComEXOJPN/servlet/conn',
	china: 'http://china-xml.exotravel.com:38080/iCom/servlet/conn',
	malaysia: 'http://malaysia-xml.exotravel.com:8080/iComLive/servlet/conn',
	laos: 'http://laos-xml.exotravel.com:8070/iCom/servlet/conn',
	myanmar: 'http://myanmar-xml.exotravel.com:38080/iComLive/servlet/conn',
	thailand_test_server: 'http://thailand-xml.exotravel.com:8080/iComTest2/servlet/conn',
	thailand_prod_server: 'http://thailand-xml.exotravel.com:8080/iCom/servlet/conn'
};

let countryCodes = {
	thailand: 'THA',
	vietnam: 'VNM',
	cambodia: 'KHM',
	indonesia: 'IDN',
	japan: 'JPN',
	china: 'CHN',
	malaysia: 'MYS',
	laos: 'LAO',
	myanmar: 'MMR'
};

let countries = {
	THA: 'thailand',
	VNM: 'vietnam',
	KHM: 'cambodia',
	IDN: 'indonesia',
	JPN: 'japan',
	CHN: 'china',
	MYS: 'malaysia',
	LAO: 'laos',
	MMR: 'myanmar'
};

function getServerUrlFromId(Id) {
	let countryCode = Id;
	let matchedPosition = countryCode.search(/[a-z]/i);
	if (matchedPosition !== -1) {
		countryCode = countryCode.substr(matchedPosition);
	}
	return servers[countries[countryCode]];
}

function removeCountryCode(key) {
	let result = key;
	let matchedPosition = result.search(/[a-z]/i);
	if (matchedPosition !== -1) {
		result = result.substr(0, matchedPosition);
	}
	return result;
}

function serverUp(serverUrl) {
	const pingRequestXML =
		`<?xml version="1.0"?>
  <!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
  <Request>
  	<PingRequest/>
	</Request>`;
	let tpReturn = request({
		method: 'post',
		url: serverUrl,
		body: pingRequestXML,
		timeout: 120000
	});
	let ignore = '<>';
	let xml = xmlescape(tpReturn.body, ignore);
	let json = XMLMapping.load(xml, {nested: true});
	return ((_.has(json, 'Reply.PingReply.Version.$t')) && (_.has(json, 'Reply.PingReply.Backend.$t')));
}

module.exports = {
	servers: servers,
	countryCodes: countryCodes,
	countries: countries,
	getServerUrlFromId: getServerUrlFromId,
	removeCountryCode: removeCountryCode,
	serverUp: serverUp
};
