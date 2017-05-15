'use strict';
const request = require('@arangodb/request');
const XMLMapping = require('xml-mapping');
const xmlescape = require('xml-escape');
const bbj2j = require('jsonapter');
const _ = require('lodash');
const addAccommodationToDB = require('../utils').addAccommodation;
const clearAccommodationCollection = require('../utils').clearAccommodations;
const serverIsUp = require('../utils/serversAndCountries').serverUp;
const servers = require('../utils/serversAndCountries').servers;
const countryCodes = require('../utils/serversAndCountries').countryCodes;
const createEdgeSupply = require('../utils').createEdgeSupply;
const cleanUpString = require('../utils').cleanUpString;
const clearSupplyCollection = require('../utils').clearSupplyCollection;

const j2j = bbj2j.instance();

const bodyXMLGT =
	`<?xml version="1.0"?>
  <!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
  <Request>
  <OptionInfoRequest>
    <AgentID>uncircled</AgentID>
    <Password>kiril123</Password>
    <Opt>???AC????????????</Opt>
    <Info>GT</Info>
  </OptionInfoRequest>
</Request>`;

function addAccommodations(serverUrl, countryCode) {
	let tpReturn = request({
		method: 'post',
		url: serverUrl,
		body: bodyXMLGT,
		timeout: 120000
	});
	let ignore = '<>';
	let xml = xmlescape(tpReturn.body, ignore);
	let json = XMLMapping.load(xml, {nested: true});
	if (_.has(json, 'Reply.OptionInfoReply.Option')) {
		for (let i = 0; i < json.Reply.OptionInfoReply.Option.length; i++) {
			transform(json.Reply.OptionInfoReply.Option[i], countryCode);
			console.log(countryCode, ' Rec# ', i+1);
		}
	} else {
		console.log('JSON: ', JSON.stringify(json));
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
			}
		}
	}
	return result;
}

function setValue(doc, objString, testString) {
	let result = false;
	if (_.has(doc, objString)) {
		let valueString = _.get(doc, objString);
		if (valueString && (valueString.length > 0)) {
			result = (valueString === testString);
		}
	}
	return result;
}

function setText(doc, objString) {
	let result = '';
	if (_.has(doc, objString)) {
		result = _.get(doc, objString);
	}
	return cleanUpString(result);
}

function setDescription(doc, noteCategory, objString, valueObjectString) {
	let result = '';
	if (_.has(doc, objString)) {
		let category = _.get(doc, objString);
		if (category === noteCategory) {
			if (_.has(doc, valueObjectString)) {
				result = _.get(doc, valueObjectString);
			}
		}
	}
	return cleanUpString(result);
}

function setStarValue(doc, objString) {
	let result = 0;
	function getStarsValue(starString) {
		let oneToFiveStarPattern = /\d/g;
		let starValue = oneToFiveStarPattern.exec(starString);
		return Number(starValue);
	}
	if (_.has(doc, objString)) {
		let starValueString = _.get(doc, objString);
		result = getStarsValue(starValueString);
	}
	return result;
}

function setRoomsValue(doc, objString) {
	let result = [];
	if (_.has(doc, objString)) {
		let generalOpt = _.get(doc, objString);
		let roomKeys = Object.keys(generalOpt)
			.filter((k) => k.endsWith("_Avail"))
			.map((k) => k.substring(0, k.indexOf("_")));

	roomKeys.forEach((k) => {
		let available = _.get(generalOpt, `${k}_Avail.$t`).toUpperCase()
			.charAt(0) === 'Y';

			if (available) {
				result.push({
					content: {
						type: {
							value: k.toLowerCase()
						},
						available: {
							value: available
						},
						adultMax: {
							value: Number(_.get(generalOpt, `${k}_Ad_Max.$t`))
						},
						total: {
							value: Number(_.get(generalOpt, `${k}_Max.$t`))
						}
					}
				});
			}
		});
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
					return true;
				} else if (bool === 'N') {
					return false;
				}
			}
		}
	}
	return result;
}

function transform(tpDoc, countryCode) {
	let template = {
		content: {
			_key: {
				value: _.get(tpDoc, 'OptionNumber.$t').concat(countryCode),
				existsWhen: function (input) {
					if (input.OptionNumber.$t) {
						return _.partialRight(_.has, 'OptionNumber.$t');
					} else {
						console.log('Error', '_key', input, tpDoc);
					}
				}
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
			title: {
				value: setText(tpDoc, 'OptGeneral.Description.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.Description.$t')
			},
			category: {
				value: _.get(tpDoc, 'OptGeneral.ButtonName.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.ButtonName.$t')
			},
			sType: {
				value: sTypeToString(tpDoc, 'OptGeneral.SType.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.SType.$t')
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
			comment: {
				value: setText(tpDoc, 'OptGeneral.Comment.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.Comment.$t')
			},
			isPreferred: {
				value: setValue(tpDoc, 'OptGeneral.DBAnalysisCode4.$t', 'YY'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.DBAnalysisCode4.$t')
			},
			isPromotion: {
				value: setValue(tpDoc, 'OptGeneral.DBAnalysisCode5.$t', 'PM'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.DBAnalysisCode5.$t')
			},
			stayLimits: {
				content: {
					minStay: {
						value: _.get(tpDoc, 'OptGeneral.MinSCU.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.MinSCU.$t')
					},
					maxStay: {
						value: _.get(tpDoc, 'OptGeneral.MaxSCU.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.MaxSCU.$t')
					}
				}
			},
			class: {
				content: {
					code: {
						value: _.get(tpDoc, 'OptGeneral.Class.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.Class.$t')
					},
					description: {
						value: _.get(tpDoc, 'OptGeneral.ClassDescription.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.ClassDescription.$t')
					},
					stars: {
						value: setStarValue(tpDoc, 'OptGeneral.ClassDescription.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.ClassDescription.$t')
					}
				}
			},
			description: {
				value: setDescription(tpDoc, 'DES', 'OptionNotes.OptionNote.NoteCategory.$t', 'OptionNotes.OptionNote.NoteText.$t'),
				existsWhen: _.partialRight(_.has, 'OptionNotes.OptionNote.NoteCategory.$t')
			},
			boardBasis: {
				content: {
					code: {
						value: _.get(tpDoc, 'OptGeneral.DBAnalysisCode6.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.DBAnalysisCode6.$t')
					},
					description: {
						value: _.get(tpDoc, 'OptGeneral.DBAnalysisDescription6.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.DBAnalysisDescription6.$t')
					}
				}
			},
			voucherName: {
				value: setText(tpDoc, 'OptGeneral.VoucherName.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.VoucherName.$t')
			},
			rooms: {
				arrayContent: setRoomsValue(tpDoc, 'OptGeneral'),
				existsWhen: _.partialRight(_.has, 'OptGeneral')
			},
			pax: {
				content: {
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
								value: setText(tpDoc, 'OptGeneral.OptExtras.OptExtra[0].Description.$t'),
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
								value: setText(tpDoc, 'OptGeneral.OptExtras.OptExtra[1].Description.$t'),
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
								value: setText(tpDoc, 'OptGeneral.OptExtras.OptExtra[2].Description.$t'),
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
								value: setText(tpDoc, 'OptGeneral.OptExtras.OptExtra[3].Description.$t'),
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
								value: setText(tpDoc, 'OptGeneral.OptExtras.OptExtra[4].Description.$t'),
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

	addAccommodationToDB(result);
}

function fetchDataFromTPServer(serverUrl, countryCode) {
	if (serverIsUp(serverUrl)) {
		console.log('Fetching accommodation data from server: ', serverUrl);
		addAccommodations(serverUrl, countryCode);
	} else {
		console.log('Server is down: ', serverUrl);
	}
}

function importAccomedationsFromTourPlan(clearCollection, fetchData, fetchFromProdServer, clearsupplyCollection, createEdges) {
	console.log('Start import accommodations!');
	if (clearCollection) {
		console.log('Clear accommodation collection');
		clearAccommodationCollection();
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
		createEdgeSupply('transfers');
	}
	console.log('Import accommodations done!');
}

// Import
importAccomedationsFromTourPlan(true, false, true, false, false);

module.exports = {
	importAccomedationsFromTourPlan
};
