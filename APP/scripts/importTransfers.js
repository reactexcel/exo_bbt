'use strict';
const db = require('@arangodb').db;
const request = require('@arangodb/request');
const XMLMapping = require('xml-mapping');
const xmlescape = require('xml-escape');
const bbj2j = require('jsonapter');
const _ = require('lodash');
const addTransfer = require('../utils').addTransfer;
const servers = require('../utils/serversAndCountries').servers;
const getCountryCode = require('../utils/serversAndCountries').countryCodes;
const clearTransfersCollection = require('../utils').clearTransfers;
const createEdgeSupply = require('../utils').createEdgeSupply;
const clearSupplyCollection = require('../utils').clearSupplyCollection;
const serverIsUp = require('../utils/serversAndCountries').serverUp;

let j2j = bbj2j.instance();

/*eslint no-console: 1*/

function getXML(type) {
	return `<?xml version="1.0"?>
  <!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
  <Request>
  <OptionInfoRequest>
    <AgentID>uncircled</AgentID>
    <Password>kiril123</Password>
    <Opt>???${type}????????????</Opt>
    <Info>GT</Info>
  </OptionInfoRequest>
</Request>`;
}


function addTransfers(serverUrl, bodyXMLType, countryCode) {
	let tpReturn = request({
		method: 'post',
		url: serverUrl,
		body: getXML(bodyXMLType),
		timeout: 60000
	});
	let ignore = '<>';
	let xml = xmlescape(tpReturn.body, ignore);
	let json = XMLMapping.load(xml, {nested: true});
	if (_.has(json, 'Reply.OptionInfoReply.Option')) {
		for (let i = 0; i < json.Reply.OptionInfoReply.Option.length; i++) {
			let option = json.Reply.OptionInfoReply.Option[i];
			transform(option, countryCode, bodyXMLType);
			console.log(countryCode, ' Rec# ', i+1);
		}
	}
}

function sTypeToString(doc, objString) {
	let result = '';
	if (_.has(doc, objString)) {
		let sType = _.get(doc, objString);
		if (sType && (sType.length > 0)) {
			switch (sType) {
				case 'Y':
					result = 'accommodation';
					break;
				case 'A':
					result = 'apartment';
					break;
				case 'P':
					result = 'package';
					break;
				case 'N':
					result = 'non-accommodation';
					break;
				default:
					result = '';
					break;
			}
		}
	}
	return result;
}

function setGuideLanguage(doc, objString) {
	let result = 'No Guide';
	if (_.has(doc, objString)) {
		let languageCode = _.get(doc, objString);
		switch (languageCode) {
			case 'DE':
				result = 'German';
				break;
			case 'EN':
				result = 'English';
				break;
			case 'ES':
				result = 'Spanish';
				break;
			case 'FR':
				result = 'French';
				break;
			default:
				result = 'No Guide';
				break;
		}
	}
	return result;
}

function setDescription(doc, noteCategory, objString, valueObjectString) {
	let category = _.get(doc, objString);
	let result;
	if (category === noteCategory) {
		result = _.get(doc, valueObjectString);
	}
	return result;
}

function setMaxPaxValue(tpDoc, objString) {
	let maxPaxValue = Number(_.get(tpDoc, objString));
	let result;
	if (maxPaxValue > 1) {
		result = maxPaxValue;
	}
	return result;
}

function setBooleanValue(doc, objString, defaultValue) {
	let result = defaultValue;
	if (_.has(doc, objString)) {
		let bool = _.get(doc, objString);
		if (bool) {
			if (bool.length > 0) {
				bool = bool.toUpperCase().charAt(0);
				if (bool === 'Y') {
					result = true;
				} else if (bool === 'N') {
					result = false;
				}
			}
		}
	}
	return result;
}

function setClassCode(doc, objString, defaultString, transferCollection) {
	let result = defaultString;
	if (transferCollection === 'FL') {
		let classCode = _.get(doc, objString);
		result = classCode;
	}
	return result;
}

function setTpCode(doc, objString, transferCollection) {
	let result = transferCollection;
	if (transferCollection === 'TF') {
		result = _.get(doc, objString);
	} else if (transferCollection === 'TP') {
		let tpClass = _.get(doc, objString);
		if (tpClass === 'TI' || 'TO') {
			result = 'TP' + tpClass;
		} else {
			result = tpClass;
		}
	}
	return result;
}

function setTpDescription(doc, objString, transferCollection) {
	let result = '---Description manually entry---';
	let tpCode = setTpCode(doc, objString, transferCollection);
	switch (tpCode) {
		case 'FL':
			result = 'Plane';
			break;
		case 'BO':
			result = 'Boat';
			break;
		case 'TUK':
			result = 'Taxi';
			break;
		case 'TRN':
			result = 'Train';
			break;
		case 'PUB':
			result = 'Public Transport';
			break;
		case 'HEL':
			result = 'Helicopter';
			break;
		case 'OTH':
			result = 'Other - no';
			break;
		case 'PCT' || 'PVS' || 'PVU' || 'TPTI' || 'TPTO' || 'TI' || 'TO':
			result = '---Description manually entry (Car/Limo, Taxi, Van, Bus)---';
			break;
		default :
			result = '';
			break;
	}
	return result;
}

function setDaysOfWeekUnavailable(doc, objString) {
	function setDay(days, daysOfWeek, day) {
		if (daysOfWeek.indexOf(day) === -1) {
			days.push(day);
		}
	}
	let result = [];
	let daysOfWeek = _.get(doc, objString);
	if (daysOfWeek) {
		let aWeek = ['Mon', 'Tues', 'Weds', 'Thur', 'Fri', 'Sat', 'Sun'];
		for (let i = 0; i < aWeek.length; i++) {
			setDay(result, daysOfWeek, aWeek[i]);
		}
	}
	return result;
}

function transform(tpDoc, countryCode, transferCollection) {
	let template = {
		content: {
			_key: {
				value: _.get(tpDoc, 'OptionNumber.$t').concat(countryCode),
				existsWhen: _.partialRight(_.has, 'OptionNumber.$t')
			},
			productId: {
				value: _.get(tpDoc, 'OptionNumber.$t').concat(countryCode),
				existsWhen: _.partialRight(_.has, 'OptionNumber.$t')
			},
			supplierId: {
				value: _.get(tpDoc, 'OptGeneral.SupplierId.$t').concat(countryCode),
				existsWhen: _.partialRight(_.has, 'OptGeneral.SupplierId.$t')
			},
			productOptCode: {
				value: _.get(tpDoc, 'Opt.$t'),
				existsWhen: _.partialRight(_.has, 'Opt.$t')
			},
			category: {
				value: _.get(tpDoc, 'OptGeneral.ButtonName.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.ButtonName.$t')
			},
			sType: {
				value: sTypeToString(tpDoc, 'OptGeneral.SType.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.SType.$t')
			},
			title: {
				value: _.get(tpDoc, 'OptGeneral.Description.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.Description.$t')
			},
			description: {
				value: setDescription(tpDoc, '10E', 'OptionNotes.OptionNote.NoteCategory.$t', 'OptionNotes.OptionNote.NoteText.$t'),
				existsWhen: _.partialRight(_.has, 'OptionNotes.OptionNote.NoteCategory.$t')
			},
			comment: {
				value: _.get(tpDoc, 'OptGeneral.Comment.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.Comment.$t')
			},
			guideLanguage: {
				value: setGuideLanguage(tpDoc, 'OptGeneral.DBAnalysisCode3.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.DBAnalysisCode3.$t')
			},
			locality: {
				content: {
					localityCode: {
						value: _.get(tpDoc, 'OptGeneral.Locality.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.Locality.$t')
					},
					localityName: {
						value: _.get(tpDoc, 'OptGeneral.LocalityDescription.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.LocalityDescription.$t')
					}
				},
				existsWhen: _.partialRight(_.has, 'OptGeneral.Locality.$t') || _.partialRight(_.has, 'OptGeneral.LocalityDescription.$t')
			},
			/*class: {
				content: {
					code: {
						value: setClassCode(tpDoc, 'OptGeneral.Class.$t', "---ClassCode---", transferCollection)
					}
				}
			},*/
			type: {
				content: {
					tpCode: {
						value: setTpCode(tpDoc, 'OptGeneral.Class.$t', transferCollection),
						existsWhen: _.partialRight(_.has, 'OptGeneral.Class.$t')
					}/*,
					description: {
						value: setTpDescription(tpDoc, 'OptGeneral.Class.$t', transferCollection),
						existsWhen: _.partialRight(_.has, 'OptGeneral.Class.$t')
					}*/
				}
			},
			daysOfWeekUnavailable: {
				arrayContent: setDaysOfWeekUnavailable(tpDoc, 'RateSet.AppliesDaysOfWeek.$t'),
				existsWhen: _.partialRight(_.has, 'RateSet.AppliesDaysOfWeek.$t')
			},
			voucherName: {
				value: _.get(tpDoc, 'OptGeneral.VoucherName.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.VoucherName.$t')
			},
			pax: {
				content: {
					maxPax: {
						value: setMaxPaxValue(tpDoc, 'OptGeneral.MPFCU.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.MPFCU.$t')
					},
					infants: {
						content: {
							allowed: {
								value: setBooleanValue(tpDoc, 'OptGeneral.InfantsAllowed.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.InfantsAllowed.$t')
							},
							ageFrom: {
								value: Number(_.get(tpDoc, 'OptGeneral.Infant_From.$t')),
								existsWhen: _.partialRight(_.has, 'OptGeneral.Infant_From.$t')
							},
							ageTo: {
								value: Number(_.get(tpDoc, 'OptGeneral.Infant_To.$t')),
								existsWhen: _.partialRight(_.has, 'OptGeneral.Infant_To.$t')
							},
							countInPaxBreak: {
								value: setBooleanValue(tpDoc, 'OptGeneral.CountInfantsInPaxBreak.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.CountInfantsInPaxBreak.$t')
							}
						}
					},
					children: {
						content: {
							allowed: {
								value: setBooleanValue(tpDoc, 'OptGeneral.ChildrenAllowed.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.ChildrenAllowed.$t')
							},
							ageFrom: {
								value: Number(_.get(tpDoc, 'OptGeneral.Child_From.$t')),
								existsWhen: _.partialRight(_.has, 'OptGeneral.Child_From.$t')
							},
							ageTo: {
								value: Number(_.get(tpDoc, 'OptGeneral.Child_To.$t')),
								existsWhen: _.partialRight(_.has, 'OptGeneral.Child_To.$t')
							},
							countInPaxBreak: {
								value: setBooleanValue(tpDoc, 'OptGeneral.ChildrenAllowed.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.CountChildrenInPaxBreak.$t')
							}
						}
					},
					adults: {
						content: {
							allowed: {
								value: setBooleanValue(tpDoc, 'OptGeneral.AdultsAllowed.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.AdultsAllowed.$t')
							},
							ageFrom: {
								value: Number(_.get(tpDoc, 'OptGeneral.Adult_From.$t')),
								existsWhen: _.partialRight(_.has, 'OptGeneral.Adult_From.$t')
							},
							ageTo: {
								value: Number(_.get(tpDoc, 'OptGeneral.Adult_To.$t')),
								existsWhen: _.partialRight(_.has, 'OptGeneral.Adult_To.$t')
							}
						}
					}
				}
			},
			extras: {
				content: {
					e1: {
						content: {
							sequenceNumber: {
								value: Number(_.get(tpDoc, 'OptGeneral.OptExtras.OptExtra[0].SequenceNumber.$t')),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[0].SequenceNumber.$t')
							},
							description: {
								value: _.get(tpDoc, 'OptGeneral.OptExtras.OptExtra[0].Description.$t'),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[0].Description.$t')
							},
							chargeBase: {
								value: setBooleanValue(tpDoc, 'OptGeneral.OptExtras.OptExtra[0].ChargeBasis.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[0].ChargeBasis.$t')
							},
							isCompulsory: {
								value: setBooleanValue(tpDoc, 'OptGeneral.OptExtras.OptExtra[0].IsCompulsory.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[0].IsCompulsory.$t')
							}
						}
					},
					e2: {
						content: {
							sequenceNumber: {
								value: Number(_.get(tpDoc, 'OptGeneral.OptExtras.OptExtra[1].SequenceNumber.$t')),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[1].SequenceNumber.$t')
							},
							description: {
								value: _.get(tpDoc, 'OptGeneral.OptExtras.OptExtra[1].Description.$t'),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[1].Description.$t')
							},
							chargeBase: {
								value: setBooleanValue(tpDoc, 'OptGeneral.OptExtras.OptExtra[1].ChargeBasis.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[1].ChargeBasis.$t')
							},
							isCompulsory: {
								value: setBooleanValue(tpDoc, 'OptGeneral.OptExtras.OptExtra[1].IsCompulsory.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[1].IsCompulsory.$t')
							}
						}
					},
					e3: {
						content: {
							sequenceNumber: {
								value: Number(_.get(tpDoc, 'OptGeneral.OptExtras.OptExtra[2].SequenceNumber.$t')),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[2].SequenceNumber.$t')
							},
							description: {
								value: _.get(tpDoc, 'OptGeneral.OptExtras.OptExtra[2].Description.$t'),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[2].Description.$t')
							},
							chargeBase: {
								value: setBooleanValue(tpDoc, 'OptGeneral.OptExtras.OptExtra[2].ChargeBasis.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[2].ChargeBasis.$t')
							},
							isCompulsory: {
								value: setBooleanValue(tpDoc, 'OptGeneral.OptExtras.OptExtra[2].IsCompulsory.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[2].IsCompulsory.$t')
							}
						}
					},
					e4: {
						content: {
							sequenceNumber: {
								value: Number(_.get(tpDoc, 'OptGeneral.OptExtras.OptExtra[3].SequenceNumber.$t')),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[3].SequenceNumber.$t')
							},
							description: {
								value: _.get(tpDoc, 'OptGeneral.OptExtras.OptExtra[3].Description.$t'),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[3].Description.$t')
							},
							chargeBase: {
								value: setBooleanValue(tpDoc, 'OptGeneral.OptExtras.OptExtra[3].ChargeBasis.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[3].ChargeBasis.$t')
							},
							isCompulsory: {
								value: setBooleanValue(tpDoc, 'OptGeneral.OptExtras.OptExtra[3].IsCompulsory.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[3].IsCompulsory.$t')
							}
						}
					},
					e5: {
						content: {
							sequenceNumber: {
								value: Number(_.get(tpDoc, 'OptGeneral.OptExtras.OptExtra[4].SequenceNumber.$t')),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[4].SequenceNumber.$t')
							},
							description: {
								value: _.get(tpDoc, 'OptGeneral.OptExtras.OptExtra[4].Description.$t'),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[4].Description.$t')
							},
							chargeBase: {
								value: setBooleanValue(tpDoc, 'OptGeneral.OptExtras.OptExtra[4].ChargeBasis.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[4].ChargeBasis.$t')
							},
							isCompulsory: {
								value: setBooleanValue(tpDoc, 'OptGeneral.OptExtras.OptExtra[4].IsCompulsory.$t', false),
								existsWhen: _.partialRight(_.has, 'OptGeneral.OptExtras.OptExtra[4].IsCompulsory.$t')
							}
						}
					}
				}
			}
		}
	};
	let result = j2j.run(template, tpDoc);

	if (result.extras) {
		let arr = Object.keys(result.extras).map(function (k) {
			return result.extras[k];
		});
		result.extras = arr;
	}
	db.transferProdImport.insert(result);
	//addTransfer(result, transferCollection);
}

function fetchDataFromTPServer(serverUrl, bodyXMLType, countryCode) {
	if (serverIsUp(serverUrl)) {
		console.log(`Fetching ${bodyXMLType} transfer data from server: `, serverUrl);
		addTransfers(serverUrl, bodyXMLType, countryCode);
	} else {
		console.log('Server is down: ', serverUrl);
	}
}

function injectManuallyEnteredData(manuallyDataCollection) {
	let aqlQuery = `
  FOR transferData IN @@importdata_collection
    FOR transfer IN transfers
        FILTER transfer._key == transferData.data._key && 
            (transferData.data.route.from.cityCode != '-' || transferData.data.route.to.cityCode != '-')
        UPDATE transfer._key WITH {"route": transferData.data.route, "class": transferData.data.class, 
        	"type": transferData.data.type, "vehicle": transferData.data.vehicle} IN transfers
        RETURN {new: NEW, old: OLD}`;
	db._query(aqlQuery, {"@importdata_collection": manuallyDataCollection}).toArray();
}

function importTransfersFromTourplan(clearCollection, fetchData, fetchFromProdServer, clearsupplyCollection, createEdges) {

	console.log('Start import transfers!');
	if (clearCollection) {
		console.log('Clear transfers collection');
		clearTransfersCollection();
	}
	if (fetchData) {

		fetchDataFromTPServer(servers.thailand_test_server, 'TF', getCountryCode.thailand);
		fetchDataFromTPServer(servers.thailand_test_server, 'TP', getCountryCode.thailand);
		fetchDataFromTPServer(servers.thailand_test_server, 'FL', getCountryCode.thailand);
		fetchDataFromTPServer(servers.thailand_test_server, 'BO', getCountryCode.thailand);
		//injectManuallyEnteredData('TFData');

	}
	if (fetchFromProdServer) {
		fetchDataFromTPServer(servers.thailand_prod_server, 'TF', getCountryCode.thailand);
		fetchDataFromTPServer(servers.thailand_prod_server, 'TP', getCountryCode.thailand);
		fetchDataFromTPServer(servers.thailand_prod_server, 'FL', getCountryCode.thailand);
		fetchDataFromTPServer(servers.thailand_prod_server, 'BO', getCountryCode.thailand);
		//createEdgeSupply('transfers');
	}

	if (clearsupplyCollection) {
		clearSupplyCollection();
	}

	if (createEdges) {
		createEdgeSupply('accommodations');
		createEdgeSupply('tours');
		createEdgeSupply('transfers');
	}
}

// Import do not clear collections. Static information will be overwritten.
importTransfersFromTourplan(false, false, true, false, false);

module.exports = {
	importTransfersFromTourplan
};

//arangodump --server.username root --server.database exo-dev --collection TP --collection TF --collection FL --collection BO --output-directory "dump" --overwrite true

//arangoimp --server.username root --server.database exo-dev --collection TFData --file FL_*.data.json --create-collection true
//arangoimp --server.username root --server.database exo-dev --collection TFData --file TF_*.data.json --create-collection true
//arangoimp --server.username root --server.database exo-dev --collection TFData --file TP_*.data.json --create-collection true
//arangoimp --server.username root --server.database exo-dev --collection TFData --file TP_*.data.json --create-collection true

