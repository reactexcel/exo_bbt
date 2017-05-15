const request = require('@arangodb/request');
const XMLMapping = require('xml-mapping');
const xmlescape = require('xml-escape');
const _ = require('lodash');
const clearSupplierCollection = require('../utils').clearSuppliers;
const addSupplierToDB = require('../utils').addSupplier;
const servers = require('../utils/serversAndCountries').servers;
const countryCodes = require('../utils/serversAndCountries').countryCodes;
const serverIsUp = require('../utils/serversAndCountries').serverUp;
const bbj2j = require('jsonapter');
const createEdgeSupply = require('../utils').createEdgeSupply;
const clearSupplyCollection = require('../utils').clearSupplyCollection;
const cleanUpString = require('../utils').cleanUpString;
const randomImage = require('../utils/dummyData').getRandomHotelImage;

const j2j = bbj2j.instance();

const bodyXML =
	`<?xml version="1.0"?>
  <!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
  <Request>
		<SupplierInfoRequest>
  			<AgentID>uncircled</AgentID>
  			<Password>kiril123</Password>
			<SupplierCode>??????</SupplierCode>
			<NotesInRtf>N</NotesInRtf>
		</SupplierInfoRequest>
	</Request>`;

function setText(doc, objString) {
	let result = '';
	if (_.has(doc, objString)) {
		result = _.get(doc, objString);
	}
	return cleanUpString(result);
}

function getNoteText(doc, descriptionIdenifier) {
	let result = '';
	if (_.has(doc, 'SupplierNotes.SupplierNote')) {
		if (doc.SupplierNotes.SupplierNote.length) {
			for (let i = 0; i < doc.SupplierNotes.SupplierNote.length; i++) {
				if (doc.SupplierNotes.SupplierNote[i].NoteCategory.$t === descriptionIdenifier) {
					result = doc.SupplierNotes.SupplierNote[i].NoteText.$t;
				}
			}
		} else if (doc.SupplierNotes.SupplierNote.NoteCategory.$t === descriptionIdenifier) {
			if (_.has(doc, 'SupplierNotes.SupplierNote.NotText.$t')) {
				result = doc.SupplierNotes.SupplierNote.NotText.$t;
			}
		}
	}
	return cleanUpString(result);
}

function addImages(doc) {
	doc.images = [{url: randomImage()}];
	return doc;
}

function transform(tpDoc, countryCode) {
	let description = getNoteText(tpDoc, 'DES');
	let responsible = false;
	if ((_.has(tpDoc, 'Amenities.Amenity.AmenityCode.$t')) &&
		(_.has(tpDoc, 'Amenities.Amenity.AmenityDescription.$t'))) {
		responsible = (tpDoc.Amenities.Amenity.AmenityCode.$t === 'RES') &&
			(tpDoc.Amenities.Amenity.AmenityDescription.$t === 'Responsible');
	}
	let longLat = getNoteText(tpDoc, 'MPS');
	let longitude = '';
	let latitude = '';
	if (longLat) {
		longLat = longLat.split(',');
		longitude = longLat[0];
		latitude = longLat[1];
	}
	let childPolicy = getNoteText(tpDoc, 'SCP');
	let cancellationPolicy = getNoteText(tpDoc, 'SCX');
	let promotionDetails = getNoteText(tpDoc, 'SSN');
	let template = {
		content: {
			_key: {
				value: _.get(tpDoc, 'SupplierId.$t').concat(countryCode),
				existsWhen: _.partialRight(_.has, 'SupplierId.$t')
			},
			supplierId: {
				value: _.get(tpDoc, 'SupplierId.$t').concat(countryCode),
				existsWhen: _.partialRight(_.has, 'SupplierId.$t')
			},
			supplierCode: {
				value: _.get(tpDoc, 'SupplierCode.$t'),
				existsWhen: _.partialRight(_.has, 'SupplierCode.$t')
			},
			title: {
				value: setText(tpDoc, 'Name.$t'),
				existsWhen: _.partialRight(_.has, 'Name.$t')
			},
			description: {
				value: description,
				existsWhen: function () {
					return description;
				}
			},
			responsible: {
				value: responsible,
				existsWhen: function () {
					return responsible;
				}
			},
			address: {
				content: {
					streetAddress: {
						value: _.get(tpDoc, 'Address1.$t'),
						existsWhen: _.partialRight(_.has, 'Address1.$t')
					},
					city: {
						value: _.get(tpDoc, 'Address4.$t'),
						existsWhen: _.partialRight(_.has, 'Address4.$t')
					},
					country: {
						value: _.get(tpDoc, 'Address5.$t'),
						existsWhen: _.partialRight(_.has, 'Address5.$t')
					},
					postCode: {
						value: _.get(tpDoc, 'PostCode.$t'),
						existsWhen: _.partialRight(_.has, 'PostCode.$t')
					},
					coordinates: {
						content: {
							latitude: {
								value: longitude,
								existsWhen: function () {
									return longitude;
								}
							},
							longitude: {
								value: latitude,
								existsWhen: function () {
									return latitude;
								}
							}
						}
					}
				}
			},
			phone: {
				value: _.get(tpDoc, 'Phone.$t'),
				existsWhen: _.partialRight(_.has, 'Phone.$t')
			},
			fax: {
				value: _.get(tpDoc, 'Fax.$t'),
				existsWhen: _.partialRight(_.has, 'Fax.$t')
			},
			email: {
				value: _.get(tpDoc, 'Email.$t'),
				existsWhen: _.partialRight(_.has, 'Email.$t')
			},
			web: {
				value: _.get(tpDoc, 'Web.$t'),
				existsWhen: _.partialRight(_.has, 'Web.$t')
			},
			childPolicy: {
				value: childPolicy,
				existsWhen: function () {
					return childPolicy;
				}
			},
			cancellationPolicy: {
				value: cancellationPolicy,
				existsWhen: function () {
					return cancellationPolicy;
				}
			},
			promotionDetails: {
				value: promotionDetails,
				existsWhen: function () {
					return promotionDetails;
				}
			}
		}
	};

	let result = j2j.run(template, tpDoc);
	result = addImages(result);
	addSupplierToDB(result);
}

function addSuppliers(serverUrl, countryCode) {
	let tpReturn = request({
		method: 'post',
		url: serverUrl,
		body: bodyXML,
		timeout: 120000
	});
	let recordCounter = 0;
	let ignore = '<>';
	let xml = xmlescape(tpReturn.body, ignore);
	let json = XMLMapping.load(xml, {nested: true});
	if (_.has(json, 'Reply.SupplierInfoReply.Suppliers.Supplier')) {
		if (json.Reply.SupplierInfoReply.Suppliers.Supplier.length) {
			for (let i = 0; i < json.Reply.SupplierInfoReply.Suppliers.Supplier.length; i++) {
				transform(json.Reply.SupplierInfoReply.Suppliers.Supplier[i], countryCode);
				recordCounter++;
				console.log(countryCode, ' Rec# ', recordCounter);
			}
		} else {
			transform(json.Reply.SupplierInfoReply.Suppliers.Supplier, countryCode);
			recordCounter++;
			console.log(countryCode, ' Rec# ', recordCounter);
		}
	} else {
		console.log('JSON: ', JSON.stringify(json));
	}
}

function fetchDataFromTPServer(serverUrl, countryCode) {
	if (serverIsUp(serverUrl)) {
		console.log('Fetching supplier data from server: ', serverUrl);
		addSuppliers(serverUrl, countryCode);
	} else {
		console.log('Server is down: ', serverUrl);
	}
}

function importSuppliersFromTourplan(clearCollection, fetchData, fetchFromProdServer, clearsupplyCollection, createEdges) {
	console.log('Start import suppliers!');
	if (clearCollection) {
		console.log('Clear supplier collection');
		clearSupplierCollection();
	}
	if (fetchData) {
		fetchDataFromTPServer(servers.thailand, countryCodes.thailand);
		fetchDataFromTPServer(servers.vietnam, countryCodes.vietnam);
		fetchDataFromTPServer(servers.cambodia, countryCodes.cambodia);
		fetchDataFromTPServer(servers.myanmar, countryCodes.myanmar);
		fetchDataFromTPServer(servers.indonesia, countryCodes.indonesia);
		fetchDataFromTPServer(servers.japan, countryCodes.japan);
		fetchDataFromTPServer(servers.china, countryCodes.china);
		fetchDataFromTPServer(servers.malaysia, countryCodes.malaysia);
		fetchDataFromTPServer(servers.laos, countryCodes.laos);
	}
	if (fetchFromProdServer) {
		fetchDataFromTPServer(servers.thailand_prod_server, countryCodes.thailand);
	}
	if (clearsupplyCollection) {
		clearSupplyCollection();
	}
	if (createEdges) {
		console.log('Create supply edges...');
		createEdgeSupply('accommodations');
		createEdgeSupply('tours');
	}
	console.log('Import suppliers done!');
}

// Import
importSuppliersFromTourplan(true, false, true, false, true);

module.exports = {
	importSuppliersFromTourplan
};
