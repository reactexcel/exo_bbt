const db = require('@arangodb').db;
const request = require('@arangodb/request');
const XMLMapping = require('xml-mapping');
const xmlescape = require('xml-escape');
const _ = require('lodash');
const bbj2j = require('jsonapter');
const servers = require('../utils/serversAndCountries').servers;
const serverIsUp = require('../utils/serversAndCountries').serverUp;
const countryCodes = require('../utils/serversAndCountries').countryCodes;
const country = require('../utils/serversAndCountries').countries;
const randomImage = require('../utils/dummyData').getRandomTourImage;
const createEdgeSupply = require('../utils').createEdgeSupply;
const addToEdge = require('../utils').addToEdge;
const tours = db._collection('tours');

const j2j = bbj2j.instance();

module.exports = {
  getAllTours,
  getAllOffices,
  importAllTours
};

const tourTypes = ['HDT', 'FDT', 'EVT'];

const styles = [
  'Active', 'Cycling', 'Trekking', 'Multi-activity', 'Challenge', 'Kayaking', 'Rafting', 'Skiing',
  'Art & Architecture', 'Beach', 'Classic Journeys', 'Cruising', 'Culinary', 'Family with teenagers',
  'Multi-generational', 'Young family', 'Festivals', 'Heritage & Culture', 'Homestay', 'Honeymoon',
  'Nature & Wildlife', 'Overland journeys', 'Photography', 'Promotion & Green Season', 'Small group journey',
  'Sustainable', 'Wellness & Spirit'];

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

function setDescription(doc, noteCategory, objString, valueObjectString) {
  let result = '';
  if (_.has(doc, objString)) {
    let category = _.get(doc, objString);
    if ((category === noteCategory) && (_.has(doc, valueObjectString))) {
      result = _.get(doc, valueObjectString);
    }
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

function setPolicyValue(doc, policyType, objString, valueObjectString) {
  let result = '';
  if (_.has(doc, objString)) {
    let policyValue = _.get(doc, objString);
    if ((policyValue === policyType) && (_.has(doc, valueObjectString))) {
      result = _.get(doc, valueObjectString);
    }
  }
  return result;
}

function setMaxPaxValue(doc, objString) {
  let result = '';
  if (_.has(doc, objString)) {
    let maxPaxValue = Number(_.get(doc, objString));
    if (maxPaxValue > 1) {
      result = maxPaxValue;
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

function getTimeSlotObject(slot) {
  let timeSlotObject = {
    Morning: {available: false, pickupTime: '0700', dropoffTime: '1300'},
    Afternoon: {available: false, pickupTime: '0700', dropoffTime: '1300'},
    Evening: {available: false, pickupTime: '0700', dropoffTime: '1300'}
  };
  switch (slot) {
    case 1:
      timeSlotObject =
        {
          Morning: {available: true, pickupTime: '0700', dropoffTime: '1300'},
          Afternoon: {available: false, pickupTime: '1100', dropoffTime: '1700'},
          Evening: {available: false, pickupTime: '1700', dropoffTime: '2300'}
        };
      break;
    case 2:
      timeSlotObject =
        {
          Morning: {available: true, pickupTime: '0700', dropoffTime: '1300'},
          Afternoon: {available: true, pickupTime: '1100', dropoffTime: '1700'},
          Evening: {available: false, pickupTime: '1700', dropoffTime: '2300'}
        };
      break;
    case 3:
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
    let code = doc.duration.durationCode;
    if (code === 'EVT') {
      doc.timeSlots = getTimeSlotObject(3);
    } else if (code === 'FDT') {
      doc.timeSlots = getTimeSlotObject(1);
    } else if (code === 'HDT') {
      doc.timeSlots = getTimeSlotObject(2);
    }
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
        value: _.get(tpDoc, 'OptGeneral.Description.$t'),
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
      comment: {
        value: _.get(tpDoc, 'OptGeneral.Comment.$t'),
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
            value: _.get(tpDoc, 'OptGeneral.ClassDescription.$t'),
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
            value: _.get(tpDoc, 'OptGeneral.SupplierName.$t'),
            existsWhen: _.partialRight(_.has, 'OptGeneral.SupplierName.$t')
          }
        },
        existsWhen: _.partialRight(_.has, 'OptGeneral.SupplierId.$t') || _.partialRight(_.has, 'OptGeneral.SupplierName.$t')
      },
      voucherName: {
        value: _.get(tpDoc, 'OptGeneral.VoucherName.$t'),
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
    let arr = Object.keys(result.extras).map(function (key) {
      return result.extras[key];
    });
    result.extras = arr;
  }
  result = addTimeSlots(result);
  delete result.duration;
  result = addRankValues(result);
  result = addRandomStyles(result);
  result = addImages(result);
  return result;
}

function getRequestXML(agentID, password) {
  const bodyXML =
    `<?xml version="1.0"?>
    <!DOCTYPE Request SYSTEM "hostConnect_3_10_000.dtd">
    <Request>
    <OptionInfoRequest>
      <AgentID>${agentID}</AgentID>
      <Password>${password}</Password>
      <Opt>???PK????????????</Opt>
      <Info>GT</Info>
    </OptionInfoRequest>
  </Request>`;
  return bodyXML;
}

function addTourToDB(tour) {
  const document = JSON.stringify(tour);
  const aqlAddTour = `
    UPSERT ${document}
    INSERT ${document}
    UPDATE {}
    IN tours
    RETURN NEW`;
  return db._query(aqlAddTour).next();
}

function getToursFromTourPlan(serverUrl, requestXML, countryCode, isGenericSource, officeKey) {
  let result = [];
  if (serverIsUp(serverUrl)) {
    console.log('Fetching tour data from server: ', serverUrl);
    const tpReturn = request({
      method: 'post',
      url: serverUrl,
      body: requestXML,
      timeout: 120000
    });
    const ignore = '<>';
    const xml = xmlescape(tpReturn.body, ignore);
    const json = XMLMapping.load(xml, {nested: true});
    let recordCounter = 0;
    if (_.has(json, 'Reply.OptionInfoReply.Option')) {
      json.Reply.OptionInfoReply.Option.map(function (option) {
        if (_.has(option, 'OptGeneral.Class')) {
          if (tourTypes.indexOf(option.OptGeneral.Class.$t.toUpperCase()) !== -1) {
            const tour = transform(option, countryCode);
            recordCounter++;
            console.log(countryCode, ' Rec# ', recordCounter);
            if (isGenericSource) {
              const newTour = addTourToDB(tour);
              result.push(newTour);
            } else {
              const tourDoc = tours.document('tours/' + tour._key);
              if (tourDoc) {
                addToEdge('offices', officeKey, 'tours', tour._key, 'selected', {type: 'generic'});
                result.push(tourDoc);
              } else {
                const newTour = addTourToDB(tour);
                addToEdge('offices', officeKey, 'tours', newTour._key, 'selected', {type: 'specific'});
                result.push(newTour);
              }
            }
          }
        }
        return result;
      });
    } else {
      console.log('JSON: ', JSON.stringify(json));
    }
  }
  else {
    console.log('Server is down: ', serverUrl);
  }
  return result;
}

function importGenericTours() {
  const requestXML = getRequestXML('uncircled', 'kiril123');
  const codes = [
    "THA",
    "VNM",
    "KHM",
    "IDN",
    "JPN",
    "CHN",
    "MYS",
    "LAO",
    "MMR"
    ];
  let result = [];
  let isGenericSource = true;
  codes.map(function (countryCode) {
    return result.push(getToursFromTourPlan(servers[country[countryCode]], requestXML, countryCode, isGenericSource));
  });
  return result;
}

// -- Interface --
function getAllTours(agentID, password, isGenericSource) {
  const requestXML = getRequestXML(agentID, password);
  const serverLocations = ['thailand'];//['thailand', 'vietnam', 'cambodia', 'indonesia', 'japan', 'china', 'malaysia', 'laos', 'myanmar'];
  let result = [];
  serverLocations.map(function (location) {
    return result.push(getToursFromTourPlan(servers[location], requestXML, countryCodes[location], isGenericSource));
  });
  return result;
}

function getAllOffices() {
  const aqlQuery = `
  LET offices = (FOR office IN offices
    FILTER !IS_NULL(office.workInCountries)
    RETURN MERGE({officeKey: office._key}, {workIn: office.workInCountries}))

  FOR office IN offices
    FOR country IN office.workIn
    RETURN MERGE( {Key:  office.officeKey}, {countryCode: country.countryCode}, {agentId: country.tpUID}, {password: country.tpPW})`;
  return db._query(aqlQuery).toArray();
}

function importAllTours() {
  // 1. Clear tours and selected collections
  console.log('Clear tours collection.');
  tours.truncate();
  // 2. Import generic tours
  console.log('Import generic tours.');
  const result = importGenericTours();
  // 3. Iterate over agents. If tour isSpecific add and create edge else add generic edge.
  const allOffices = getAllOffices();
  console.log('Import specific tours.');
  allOffices.map(function (office) {
    let serverUrl = servers[country[office.countryCode]];
    let requestXML = getRequestXML(office.agentID, office.password);
    let isGenericSource = false;
    let newTours = getToursFromTourPlan(serverUrl, requestXML, office.countryCode, isGenericSource, office.Key);
    return result.push(newTours);
  });
  // 4. Create supply edges
  console.log('Create accommodations supply edges...');
  createEdgeSupply('accommodations');
  console.log('Create tours supply edges...');
  createEdgeSupply('tours');
  console.log('Create transfers supply edges...');
  createEdgeSupply('transfers');
  return result;
}
