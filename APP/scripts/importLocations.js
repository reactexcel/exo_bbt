const db = require("@arangodb").db;
const upsertDocument = require('../utils').upsertDocument;
const addLocation = require('../utils').addLocation;
const clearLocations = require('../utils').clearLocations;
const clearLocatedIn = require('../utils').clearLocatedIn;

const clearCollection = true;
const createEdges = true;

const createLocation = function(data, type) {
  let resultDoc = {
    type: type,
    unCode: data.unCode,
    tpCode: data.tpCode,
    name: data.name,
    map: {
      latitude: data.latitude,
      longitude: data.longitude,
      zoomLevel: data.zoomLevel
    },
    phoneCode: data.phoneCode,
    timeZone: { // city only
      timeZoneCode: data.timeZoneCode,
      timeOffset: data.timeOffset
    },
    description: data.description,
    images: [],
    isEXODestination: Boolean(data.isEXODestination)
  };

  if (type === 'city') {
    resultDoc.province = {
      isoProvinceCode: data.provinceISOCode,
      provinceName: data.provinceName
    };

    resultDoc.timeZone = {
      timeZoneCode: data.timeZoneCode,
      timeOffset: data.timeOffset
    };

    resultDoc.country = data.Country;
  }

  if (type === 'country') {
    resultDoc.tpServer = data.tpServer; // country only
  }

  return resultDoc;
};

// IMPORT SCRIPT

console.log('Start import locations!');
if (clearCollection) {
  console.log('Clear locations collection');
  clearLocatedIn();
  clearLocations();
}

const countriesArr = require('./data/Countries.json');
countriesArr.forEach(country => {
  addLocation(createLocation(country, 'country'));
});

const citiesArr = require('./data/Cities.json');
citiesArr.forEach(city => {
  addLocation(createLocation(city, 'city'));
});

if (createEdges) {
  console.log('Create locatedIn edges...');
  const aqlQuery = `
  FOR countries IN locations
  FILTER countries.type == "country"
      FOR cities IN locations
          FILTER cities.country == countries.tpCode
          INSERT {_from: countries._id, _to: cities._id} IN locatedIn`;

  db._query(aqlQuery).next();
}
console.log('Import locations done!');
