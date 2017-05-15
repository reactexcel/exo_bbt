'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

const db = require('@arangodb').db;
const request = require('@arangodb/request');
const XMLMapping = require('xml-mapping');
const _ = require('lodash');
const servers = require('../utils/serversAndCountries').servers;
const countryCodes = require('../utils/serversAndCountries').countryCodes;
const AccessibleAccommodations = require('../models/accessibleaccommodations');
const getAccessibleSuppliersXML = require('../utils/tpXMLScripts').getAccessibleSuppliersXML;

function addRate(rates, optRate, accKey) {
	if (optRate.length) {
		if ((_.has(optRate[0], 'RateName.$t')) && (_.has(optRate[0], 'RateText.$t')) && (_.has(optRate[0].RoomRates, 'DoubleRate.$t'))) {
			rates.push({accKey: accKey, name: optRate[0].RateName.$t, description: optRate[0].RateText.$t, doubleRoomRate: optRate[0].RoomRates.DoubleRate.$t});
		}
	} else {
		if ((_.has(optRate, 'RateName.$t')) && (_.has(optRate, 'RateText.$t')) && (_.has(optRate.RoomRates, 'DoubleRate.$t'))) {
			rates.push({accKey: accKey, name: optRate.RateName.$t, description: optRate.RateText.$t, doubleRoomRate: optRate.RoomRates.DoubleRate.$t});
		}
	}
}

function getCheapestRates(cheapestRoomRates) {
	let aqlQuery = `
	FOR cheapestRate IN @cheapestRoomRates
    COLLECT supplier = cheapestRate.supplierId
    RETURN {supplierId: supplier, cheapestRate: FIRST(
        FOR cheapRate IN @cheapestRoomRates
            FILTER cheapRate.supplierId == supplier
            RETURN {amount: cheapRate.DoubleRoomRate, currency: cheapRate.currency})}`;
	return db._query(aqlQuery, {'cheapestRoomRates': cheapestRoomRates}).toArray();
}

function addCheapestRoomRate(cheapestRoomRates, RoomRates, currency, accKey) {
	let aqlQuery = `
	FOR accommodation IN accommodations
		FILTER accommodation._key == @accKey
		RETURN accommodation.supplierId`;
	let supplierId = db._query(aqlQuery, {'accKey': accKey}).next();
	if (_.has(RoomRates, 'DoubleRate.$t')) {
		cheapestRoomRates.push({supplierId: supplierId, DoubleRoomRate: RoomRates.DoubleRate.$t, currency: currency.$t});
	}
}

function addPromotion(resultArray, promotion) {
	if (_.has(promotion, 'Type.Number')) {
		let valueAddType = promotion.Type.Number;
		// console.log('Type.Number ', valueAddType);
		if (valueAddType >= 1 && valueAddType <= 6) {
			resultArray.push({description: promotion.Description.$t});
		}
	}
	return resultArray;
}

function addPromotions(accommodation, productId, optRate, resultPromotions) {
	let promotions = Array();
	if (_.has(optRate, 'ValueAdds')) {
		// console.log('Length: ', optRate.ValueAdds.ValueAdd.length);
		if (optRate.ValueAdds.ValueAdd.length) {
			for (let i = 0; i < optRate.ValueAdds.ValueAdd.length; i++) {
				addPromotion(promotions, optRate.ValueAdds.ValueAdd[i]);
			}
		} else {
			addPromotion(promotions, optRate.ValueAdds.ValueAdd);
		}
	}
	let isPromotion = false;
	if (accommodation && accommodation.isPromotion) {
		isPromotion = accommodation.isPromotion;
	}
	resultPromotions.push({
		accKey: productId,
		promotions: promotions,
		hasPromotions: isPromotion});
}

function queryAccomodations(params) {
	function getisPreselect(params) {
		if (params.accommodationPlacementKey) {
			return `LET isPreselected = LENGTH((FOR vertex, edge IN OUTBOUND CONCAT("accommodationPlacements/", @accommodationPlacementKey) preselect
						FILTER edge._to == CONCAT("accommodations/", prod)
						RETURN edge))>0`;
		} else {
			return ``;
		}
	}
	function getisPreselectedResult(params) {
		if (params.accommodationPlacementKey) {
			return `, {isPreselected: isPreselected}`;
		} else
		{
			return ``;
		}
	}
	let aqlQuery = `
	FOR sup IN @suppliers
  FOR supplier IN suppliers
    LET supplierKey = sup
    FILTER supplier._key == supplierKey
    FOR cheapRate IN @cheapestRoomRates
    FILTER cheapRate.supplierId == supplierKey
    RETURN MERGE(
     supplier, {cheapestRoomRate: cheapRate.cheapestRate.amount}, {currency: cheapRate.cheapestRate.currency},
        { accommodations: (
            FOR prod IN @products
            		${getisPreselect(params)}
                FOR acc IN accommodations
                LET acc_Key = prod
                FILTER acc.productId == prod &&
                    acc.supplierId == sup &&
                    acc._key == acc_Key
                    LET promotions = (FOR promotion IN @promotions FILTER promotion.accKey == acc_Key RETURN promotion.promotions)
                    LET accPromotions = MERGE(acc, { promotions: FIRST(promotions) })
                    LET rates = (FOR rate IN @rates FILTER rate.accKey == acc_Key RETURN {name: rate.name, description: rate.description, doubleRoomRate: rate.doubleRoomRate})
                    LET accWithPromotions = MERGE(accPromotions, { rate: FIRST(rates) })
                    LET hasPromotions = (FOR promotion IN @promotions FILTER promotion.accKey == acc_Key RETURN promotion.hasPromotions)
                    RETURN MERGE(accWithPromotions, {hasPromotions: FIRST(hasPromotions)} ${getisPreselectedResult(params)})
                    )
        }
    )`;
	return db._query(aqlQuery, params).toArray();
}

function getAccommodation(accommodationKey) {
	let aqlQuery = `
	FOR acc IN accommodations
		FILTER acc._key == @accKey
		RETURN acc`;
	return db._query(aqlQuery, {'accKey': accommodationKey}).next();
}

function getAccommodations(requestXML, tourplanServerUrl, countryCode) {
	let suppliers = [];
	let products = [];
	let promotions = [];
	let rate = [];
	let cheapestRoomRates = [];
	let result = {};
	let tpReturn = request({
		method: 'post',
		url: tourplanServerUrl,
		body: requestXML,
		timeout: 120000
	});
	let xml = tpReturn.body;
	let json = XMLMapping.load(xml, {nested: true});
	if (_.has(json, 'Reply.OptionInfoReply.Option')) {
		for (let i=0; i<json.Reply.OptionInfoReply.Option.length; i++) {
			let supplierId = json.Reply.OptionInfoReply.Option[i].OptGeneral.SupplierId.$t;
			supplierId = supplierId.concat(countryCode);
			let productId = json.Reply.OptionInfoReply.Option[i].OptionNumber.$t;
			productId = productId.concat(countryCode);
			let optRates = json.Reply.OptionInfoReply.Option[i].OptRates;
			let optRate = optRates.OptRate;
			let roomRates;
			if (optRate.length) {
				roomRates = optRate[0].RoomRates;
			} else {
				roomRates = optRate.RoomRates;
			}
			let accommodation = getAccommodation(productId);
			addPromotions(accommodation, productId, optRate, promotions);
			addRate(rate, optRate, productId);
			addCheapestRoomRate(cheapestRoomRates, roomRates, optRates.Currency, productId);
			suppliers.push(supplierId);
			products.push(productId);
		}
	}
	products = _.uniq(products);
	suppliers = _.uniq(suppliers);
	result.products = products;
	result.suppliers = suppliers;
	result.promotions = promotions;
	result.rates = rate;
	cheapestRoomRates = _.orderBy(cheapestRoomRates, ['supplierId', 'DoubleRoomRate'], ['asc', 'asc']);
	result.cheapestRoomRates = getCheapestRates(cheapestRoomRates);
	return result;
}

function getAccommodationsLocalData(cityCode, countryCode, accommodationPlacementKey) {
  // NOTES, some locatedIn edges missing.
  // 1. locations --locatedIn--> locations
  // 2. and accommodations --locatedIn--> locations
  /*
  const aqlQuery = `
	LET countryCode = @countryCode
	LET cityCode = @cityCode

	LET countryLocationId = FIRST(FOR country IN locations
    FILTER country.type == 'country' && country.tpCode == countryCode
    RETURN country._id)

	LET cityId = FIRST(FOR cities IN 1..1 INBOUND countryLocationId GRAPH 'exo-dev'
  	FILTER IS_SAME_COLLECTION('locations', cities) && cities.tpCode == cityCode
  	RETURN cities._id)

	FOR supplier IN 2..2 INBOUND cityId GRAPH 'exo-dev'
     FILTER IS_SAME_COLLECTION('suppliers', supplier)
     LET accommodations = (
       FOR accommodation IN 1..1 OUTBOUND supplier._id GRAPH 'exo-dev'
         FILTER IS_SAME_COLLECTION('accommodations', accommodation)
       RETURN accommodation )

  RETURN MERGE(supplier, {accommodation: accommodations})`;
  */

  // use the accommodation productCode and productId to query.
  // first 3 characters of the productOptCode as CityCode,
  // and last 3 characters of the productId as CountryCode
	if (accommodationPlacementKey) {
		// change accommodationPlacement, will need to load the 'isPreselected' field from edge 'preselect'
		const aqlQuery = `
			LET countryCode = @countryCode
			LET cityCode = @cityCode
		  LET supplierIds = (FOR acc IN accommodations
		    FILTER LEFT(acc.productOptCode, 3) == cityCode && RIGHT(acc.productId,3) == countryCode && acc.category == 'Accommodation'
		    return DISTINCT acc.supplierId)
		  FOR supplierId IN supplierIds
		    LET supplier = document(concat('suppliers/', supplierId))
		    LET accommodations = (
		      FOR accommodation IN 1..1 OUTBOUND supplier._id GRAPH 'exo-dev'
		        FILTER IS_SAME_COLLECTION('accommodations', accommodation)
		        LET isPreselected = LENGTH((FOR vertex, edge IN OUTBOUND CONCAT("accommodationPlacements/", @accommodationPlacementKey) preselect
					FILTER edge._to == accommodation._id
					RETURN edge))>0
		        RETURN MERGE(accommodation, {isPreselected: isPreselected}) )
		    RETURN MERGE(supplier, {accommodation: accommodations})`;

		return db._query(aqlQuery, {cityCode, countryCode, accommodationPlacementKey}).toArray();

	} else {
		// new accommodationPlacement
		const aqlQuery = `
	  LET countryCode = @countryCode
	  LET cityCode = @cityCode
	  LET supplierIds = (FOR acc IN accommodations
	    FILTER LEFT(acc.productOptCode, 3) == cityCode && RIGHT(acc.productId,3) == countryCode && acc.category == 'Accommodation'
	    return DISTINCT acc.supplierId)
	  FOR supplierId IN supplierIds
	    LET supplier = document(concat('suppliers/', supplierId))
	    LET accommodations = (
	      FOR accommodation IN 1..1 OUTBOUND supplier._id GRAPH 'exo-dev'
	        FILTER IS_SAME_COLLECTION('accommodations', accommodation)
	      RETURN accommodation )
	    RETURN MERGE(supplier, {accommodation: accommodations})`;

		return db._query(aqlQuery, {cityCode, countryCode}).toArray();
	}
}

/** Retrieves accessible accommodation from local database.
 *
 * Retrieves accessible accommodation from local database.
 * The information has to be in the
 * requestBody.
 */
router.post('/', function (req, res) {
	let agentid = 'uncircled';
	let password = 'kiril123';
	let country = req.body.country;
	let city = req.body.city;
	let date = req.body.date;
	let duration = req.body.duration;
	let accommodationPlacementKey = req.body.accommodationPlacementKey;
	let useRemoteDataOnly = req.body.useRemoteDataOnly;
	let result = {};
	if (useRemoteDataOnly) {
		const requestAccessibleXML = getAccessibleSuppliersXML(
			{agentid: agentid,
			password: password,
			city: city,
			date: date,
			duration: duration});
		let suppliersProducts = getAccommodations(requestAccessibleXML, servers[country.toLowerCase()], countryCodes[country.toLowerCase()]);
		suppliersProducts.accommodationPlacementKey = accommodationPlacementKey;
		result = queryAccomodations(suppliersProducts);
	} else {
		result = getAccommodationsLocalData(city.toUpperCase(), countryCodes[country.toLowerCase()], accommodationPlacementKey);
	}
	res.json(result);
})
	.body(AccessibleAccommodations, 'Retrieve accessible accommodations');


/**
 <Request>
 <OptionInfoRequest>
 <AgentID>uncircled</AgentID>
 <Password>kiril123</Password>
 <Opt>BKKACSOSBKK??????</Opt>
 <Info>GR</Info>
 <DateFrom>2016-10-10</DateFrom>
 <SCUqty>1</SCUqty>
 </OptionInfoRequest>
 </Request>
 BKKACSOSBKK
 **/
