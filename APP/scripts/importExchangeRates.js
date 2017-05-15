'use strict';
const request = require('@arangodb/request');
const db = require("@arangodb").db;
const XMLMapping = require('xml-mapping');
const xmlescape = require('xml-escape');
const bbj2j = require('jsonapter');
const _ = require('lodash');
const serverIsUp = require('../utils/serversAndCountries').serverUp;
const currencyRates = db._collection('currencyRates');
const servers = require('../utils/serversAndCountries').servers;

const j2j = bbj2j.instance();

const requestXML = `<?xml version="1.0"?>
<!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
<Request>
 <GetCurrencyConversionsRequest>
   <AgentID>uncircled</AgentID>
   <Password>kiril123</Password>
 </GetCurrencyConversionsRequest>
</Request>`;

function addCurrencyRateToDB(document) {
  if (document.rates) {
    currencyRates.save(document);
  }
}

function validDate(date) {
  let toDate = new Date(date);
  toDate.setDate(toDate.getDate() + 1);
  let todayDate = new Date();
  return (toDate >= todayDate);
}

function transform(tpDoc) {
  let template = {
    content: {
      currencyFrom: {
        value: _.get(tpDoc, 'FromCurrency.$t'),
        existWhen: _.partialRight(_.has, 'FromCurrency.$t')
      },
      curencyTo: {
        value: _.get(tpDoc, 'ToCurrency.$t'),
        existWhen: _.partialRight(_.has, 'ToCurrency.$t')
      },
      rates: {
        value: function(input) {
          let result = null;
          if ((input.IsMultiplier.$t === "Y") && validDate(input.DateTo.$t)) {
            result = {dateFrom: input.DateFrom.$t, dateTo: input.DateTo.$t, rate: input.ConversionRate.$t};
          }
          return result;
        },
        dataKey: 'CurrencyConversions.CurrencyConversion'
      }
    }
  };
  let currencuDoc = j2j.run(template, tpDoc);
  addCurrencyRateToDB(currencuDoc);
}

function addCurrencyRates(serverUrl) {
  const tpReturn = request({
    method: 'post',
    url: serverUrl,
    body: requestXML,
    timeout: 120000
  });
  let ignore = '<>';
	let xml = xmlescape(tpReturn.body, ignore);
	let json = XMLMapping.load(xml, {nested: true});
	if (_.has(json, 'Reply.GetCurrencyConversionsReply.AllCurrencyConversions.CurrencyConversionSet')) {
		for (let i = 0; i < json.Reply.GetCurrencyConversionsReply.AllCurrencyConversions.CurrencyConversionSet.length; i++) {
      const currencyConversionSet = json.Reply.GetCurrencyConversionsReply.AllCurrencyConversions.CurrencyConversionSet[i];
      if (currencyConversionSet.ToCurrency.$t !== currencyConversionSet.FromCurrency.$t) {
        transform(currencyConversionSet);
      }
		}
	} else {
		console.log('JSON: ', JSON.stringify(json));
	}
}

function fetchDataFromTPServer(serverUrl) {
  if (serverIsUp(serverUrl)) {
    console.log('Fetching currency rates from server: ', serverUrl);
    addCurrencyRates(serverUrl);
  } else {
    console.log('Server is down: ', serverUrl);
  }
}

function importCurrencyRatesFromTourPlan(fetchFromProdServer) {
  console.log('Start import currency rates!');
  currencyRates.truncate();
  if (fetchFromProdServer) {
    fetchDataFromTPServer(servers.thailand_prod_server);
  } else {
    fetchDataFromTPServer(servers.thailand);
  }
}

// Import
importCurrencyRatesFromTourPlan(true);

module.exports = {
  importCurrencyRatesFromTourPlan
};

