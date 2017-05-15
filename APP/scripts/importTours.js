let request = require('@arangodb/request');
let XMLMapping = require('xml-mapping');
let xmlescape = require('xml-escape');
let bbj2j = require('jsonapter');
let _ = require('lodash');
let addTourToDB = require('../utils').addTour;
let servers = require('../utils/serversAndCountries').servers;
let countryCodes = require('../utils/serversAndCountries').countryCodes;
let clearTourCollection = require('../utils').clearTours;
let serverIsUp = require('../utils/serversAndCountries').serverUp;
let randomImage = require('../utils/dummyData').getRandomTourImage;
let createEdgeSupply = require('../utils').createEdgeSupply;
const cleanUpString = require('../utils').cleanUpString;
let clearSupplyCollection = require('../utils').clearSupplyCollection;

let j2j = bbj2j.instance();

let styles = [
	'Active', 'Cycling', 'Trekking', 'Multi-activity', 'Challenge', 'Kayaking', 'Rafting', 'Skiing',
	'Art & Architecture', 'Beach', 'Classic Journeys', 'Cruising', 'Culinary', 'Family with teenagers',
	'Multi-generational', 'Young family', 'Festivals', 'Heritage & Culture', 'Homestay', 'Honeymoon',
	'Nature & Wildlife', 'Overland journeys', 'Photography', 'Promotion & Green Season', 'Small group journey',
	'Sustainable', 'Wellness & Spirit'];

const bodyXMLGT =
	`<?xml version="1.0"?>
  <!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
  <Request>
  <OptionInfoRequest>
    <AgentID>uncircled</AgentID>
    <Password>kiril123</Password>
    <Opt>???PK????????????</Opt>
    <Info>GT</Info>
  </OptionInfoRequest>
</Request>`;

function setText(doc, objString) {
	let result = '';
	if (_.has(doc, objString)) {
		result = _.get(doc, objString);
	}
	return cleanUpString(result);
}

function addTours(serverUrl, countryCode) {
	let tpReturn = request({
		method: 'post',
		url: serverUrl,
		body: bodyXMLGT,
		timeout: 120000
	});
	let recordCounter = 0;
	let ignore = '<>';
	let xml = xmlescape(tpReturn.body, ignore);
	let json = XMLMapping.load(xml, {nested: true});
	if (_.has(json, 'Reply.OptionInfoReply.Option')) {
		for (let i = 0; i < json.Reply.OptionInfoReply.Option.length; i++) {
			let option = json.Reply.OptionInfoReply.Option[i];
			if (_.has(option, 'OptGeneral.Class')) {
				let tourType = option.OptGeneral.Class.$t;
				if ((tourType.toUpperCase() === 'HDT') || (tourType.toUpperCase() === 'FDT') || (tourType.toUpperCase() === 'EVT')) {
					transform(json.Reply.OptionInfoReply.Option[i], countryCode);
					recordCounter++;
					console.log(countryCode, ' Rec# ', recordCounter);
				}
			}
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

function setDescription(doc, noteCategory, objString, valueObjectString) {
	let result = '';
	let category = '';
	if (_.has(doc, objString)) {
		category = _.get(doc, objString);
	}
	if (category === noteCategory) {
		result = _.get(doc, valueObjectString);
	}
	return cleanUpString(result);
}

function setPolicyValue(doc, policyType, objString, valueObjString) {
	let result = '';
	let policyValue = '';
	if (_.has(doc, objString)) {
		policyValue = _.get(doc, objString);
	}
	if ((policyValue === policyType) && (_.has(doc, valueObjString))) {
		result = _.get(doc, valueObjString);
	}
	return result;
}

function setMaxPaxValue(doc, objString) {
	let result = '';
	let maxPaxValue = 0;
	if (_.has(doc, objString)) {
		maxPaxValue = Number(_.get(doc, objString));
	}
	if (maxPaxValue > 1) {
		result = maxPaxValue;
	}
	return result;
}

function setDurationTimeSlot(doc, objString) {
	let result = 1;
	if (_.has(doc, objString)) {
		let durationCode = _.get(doc, objString);
		if (durationCode.toUpperCase() === 'FDT') {
			result = 2;
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

function getTimeSlotObject(slot) {
	let timeSlotObject = {
		Morning: {available: false, pickupTime: '0700', dropoffTime: '1300'},
		Afternoon: {available: false, pickupTime: '0700', dropoffTime: '1300'},
		Evening: {available: false, pickupTime: '0700', dropoffTime: '1300'}
	};
	switch (slot) {
		case 'FDT':
			timeSlotObject =
				{
					Morning: {available: true, pickupTime: '0700', dropoffTime: '1300'},
					Afternoon: {available: false, pickupTime: '1100', dropoffTime: '1700'},
					Evening: {available: false, pickupTime: '1700', dropoffTime: '2300'}
				};
			break;
		case 'HDT':
			timeSlotObject =
				{
					Morning: {available: true, pickupTime: '0700', dropoffTime: '1300'},
					Afternoon: {available: true, pickupTime: '1100', dropoffTime: '1700'},
					Evening: {available: false, pickupTime: '1700', dropoffTime: '2300'}
				};
			break;
		case 'EVT':
			timeSlotObject =
				{
					Morning: {available: false, pickupTime: '0700', dropoffTime: '1300'},
					Afternoon: {available: false, pickupTime: '1100', dropoffTime: '1700'},
					Evening: {available: true, pickupTime: '1700', dropoffTime: '2300'}
				};
			break;
		default:
			timeSlotObject =
				{
					Morning: {available: true, pickupTime: '0700', dropoffTime: '1300'},
					Afternoon: {available: false, pickupTime: '0700', dropoffTime: '1300'},
					Evening: {available: false, pickupTime: '0700', dropoffTime: '1300'}
				};
	}
	return timeSlotObject;
}

function addTimeSlots(doc) {
	if (_.has(doc, 'duration.durationCode')) {
		doc.timeSlots = getTimeSlotObject(doc.duration.durationCode);
	}
	return doc;
}

function addRankValues(doc) {
	let rankValue = Math.floor(Math.random() * 99) + 1;
	doc.rank = rankValue;
	return doc;
}

function getRandomStyles(nrStyles) {
	let styleArray = styles.slice(0);
	let result = Array();
	for (let i = 0; i < nrStyles; i++) {
		let index = Math.floor(Math.random() * styleArray.length);
		result.push(styleArray[index]);
		styleArray.splice(index, 1);
	}
	return result;
}

function addRandomStyles(doc) {
	doc.styles = getRandomStyles(Math.floor(Math.random() * 5) + 1);
	return doc;
}

function addImages(doc) {
	doc.images = [{title: '', description: '', url: randomImage()}];
	return doc;
}

function transform(tpDoc, countryCode) {
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
			title: {
				value: setText(tpDoc, 'OptGeneral.Description.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.Description.$t')
			},
			category: {
				value: setText(tpDoc, 'OptGeneral.ButtonName.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.ButtonName.$t')
			},
			sType: {
				value: sTypeToString(tpDoc, 'OptGeneral.SType.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.SType.$t')
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
						value: setText(tpDoc, 'OptGeneral.LocalityDescription.$t'),
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
			description: {
				value: setDescription(tpDoc, '10E', 'OptionNotes.OptionNote.NoteCategory.$t', 'OptionNotes.OptionNote.NoteText.$t'),
				existsWhen: _.partialRight(_.has, 'OptionNotes.OptionNote.NoteCategory.$t')
			},
			durationSlots: {
				value: setDurationTimeSlot(tpDoc, 'OptGeneral.Class.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.Class.$t')
			},
			duration: {
				content: {
					durationCode: {
						value: _.get(tpDoc, 'OptGeneral.Class.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.Class.$t')
					},
					durationSlots: {
						value: setDurationTimeSlot(tpDoc, 'OptGeneral.Class.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.Class.$t')
					},
					durationDescription: {
						value: setText(tpDoc, 'OptGeneral.ClassDescription.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.ClassDescription.$t')
					}
				},
				existsWhen: _.partialRight(_.has, 'OptGeneral.Class.$t') || _.partialRight(_.has, 'OptGeneral.ClassDescription.$t')
			},
			cancellationPolicy: {
				value: setPolicyValue(tpDoc, 'SCX', 'OptionNotes.OptionNote.NoteCategory.$t', 'OptionNotes.OptionNote.NoteText.$t'),
				existsWhen: _.partialRight(_.has, 'OptionNotes.OptionNote.NoteCategory.$t')
			},
			supplier: {
				content: {
					supplierId: {
						value: _.get(tpDoc, 'OptGeneral.SupplierId.$t').concat(countryCode),
						existsWhen: _.partialRight(_.has, 'OptGeneral.SupplierId.$t')
					},
					supplierName: {
						value: setText(tpDoc, 'OptGeneral.SupplierName.$t'),
						existsWhen: _.partialRight(_.has, 'OptGeneral.SupplierName.$t')
					}
				},
				existsWhen: _.partialRight(_.has, 'OptGeneral.SupplierId.$t') || _.partialRight(_.has, 'OptGeneral.SupplierName.$t')
			},
			voucherName: {
				value: setText(tpDoc, 'OptGeneral.VoucherName.$t'),
				existsWhen: _.partialRight(_.has, 'OptGeneral.VoucherName.$t')
			},
			pax: {
				content: {
					maxPax: {
						value: setMaxPaxValue(tpDoc, 'OptGeneral.MPFCU.$t'),
						existsWhen: _.get(tpDoc, 'OptGeneral.MPFCU.$t') > 1
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
			childPolicy: {
				value: setPolicyValue(tpDoc, 'SCP', 'OptionNotes.OptionNote.NoteCategory.$t', 'OptionNotes.OptionNote.NoteText.$t'),
				existsWhen: _.partialRight(_.has, 'OptionNotes.OptionNote.NoteCategory.$t')
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
	result = addTimeSlots(result);
	delete result.duration;
	result = addRankValues(result);
	result = addRandomStyles(result);
	result = addImages(result);
	addTourToDB(result);
}

function fetchDataFromTPServer(serverUrl, countryCode) {
	if (serverIsUp(serverUrl)) {
		console.log('Fetching tour data from server: ', serverUrl);
		addTours(serverUrl, countryCode);
	} else {
		console.log('Server is down: ', serverUrl);
	}
}

function importToursFromTourplan(clearCollection, fetchData, fetchFromProdServer, clearsupplyCollection, createEdges) {
	console.log('Start import tours!');
	if (clearCollection) {
		console.log('Clear tour collection');
		clearTourCollection();
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
	console.log('Import tours done!');
}

// Import
importToursFromTourplan(true, false, true, false, false);

module.exports = {
	importToursFromTourplan
};
