'use strict';
const request = require('@arangodb/request');
const db = require("@arangodb").db;

function getCMSTourURL(offset, limit) {
  return `http://dev.exotravel.com/exo_api_export/export_channel_data/tours_experiences?data_limit=limit&offset=${offset}&limit=${limit}`;
}

function getCMSSupplierURL(offset, limit) {
  return `http://dev.exotravel.com/exo_api_export/export_channel_data/hotels?data_limit=limit&offset=${offset}&limit=${limit}`;
}

function insertDocument(document, collection) {
  let doc = JSON.stringify(document);
  let aqlQuery = `
	INSERT ${doc}
	IN ${collection}`;
  let result = db._query(aqlQuery).toArray();
  return result.length;
}

function getCMSData(addToCollection, offset, limit, fetchURL) {
  let cmsReturn = request({
    method: 'get',
    url: fetchURL,
    auth: {
      username: 'EXO2016Dev',
      password: 'OZ5xEH2qFSnPkELH66IYJ'
    },
    timeout: 120000
  });
  const products = JSON.parse(cmsReturn.body);
  products.map((product) => {
    insertDocument(product, addToCollection);
  });
  if (products.length === limit) {
    return true;
  } else {
    console.log(`Done! Total ${offset+products.length} products imported.`);
    return false;
  }
}

// function copyCollection(fromCollection, toCollection) {
//   const aqlCopy = `
//   for product in @@fromCollection
//     insert product
//     in @@toCollection
//   return NEW`;
//   db._query(aqlCopy, {'@fromCollection': fromCollection, '@toCollection': toCollection});
// }

function processTourData(sourceCollection, destinationCollection) {
  const aqlUpdate = `
    let imgURL = 'http://uncircled.asia/img/exo/'
    for cms in @@sourceCollection
      for tour in @@destinationCollection
          filter cms.tours_ex_tp_id == tour.productOptCode
          let images = not_null(cms.tours_ex_gallery) ? cms.tours_ex_gallery : [{file_original: ""}]
          let morningPickUpTime = ((cms.tours_ex_duration == 'FD') || (cms.tours_ex_duration == 'HD')) && (trim(cms.tours_ex_starttime)!='') ? trim(substitute(split(cms.tours_ex_starttime, ',')[0], ':', '')) : "0700"
          let morningDropoffTime = ((cms.tours_ex_duration == 'FD') || (cms.tours_ex_duration == 'HD')) && (trim(cms.tours_ex_endtime)!='') ? trim(substitute(split(cms.tours_ex_endtime, ',')[0], ':', '')) : "1300"
          let afternoonPickUpTime = (cms.tours_ex_duration == 'HD') && (trim(split(cms.tours_ex_starttime, ',')[1])!='') ?  trim(substitute(split(cms.tours_ex_starttime, ',')[1], ':', '')) : '1100'
          let afternoonDropoffTime = (cms.tours_ex_duration == 'HD') && (trim(split(cms.tours_ex_endtime, ',')[1])!='') ?  trim(substitute(split(cms.tours_ex_endtime, ',')[1], ':', '')) : '1700'
          let evePickUpTime = ((cms.tours_ex_duration == 'EVE')) && (trim(cms.tours_ex_starttime)!='') ? trim(substitute(split(cms.tours_ex_starttime, ',')[0], ':', '')) : "1700"
          let eveDropoffTime = (cms.tours_ex_duration == 'EVE') && (trim(cms.tours_ex_endtime)!='') ? trim(substitute(split(cms.tours_ex_endtime, ',')[0], ':', '')) : "2300"
          let startTimes = split(cms.tours_ex_starttime, ',')
          let startTimesVal = (
              for time in startTimes
                  let value = +trim(substitute(time, ':', ''))
              return value
              )
          let testMorning = (
              for time in startTimesVal
              return (time<1200)
              )
          let testAfternoon = (
              for time in startTimesVal
              return (time>=1200)
              )
          let isMorningSlot = position(testMorning, true) && ((cms.tours_ex_duration == 'FD') || (cms.tours_ex_duration == 'HD'))
          let isAfternoonSlot = (position(testAfternoon, true) && (cms.tours_ex_duration != 'EVE')) || (position(testAfternoon, true) && (cms.tours_ex_duration == 'HD')) || 
              ((trim(cms.tours_ex_starttime)=='') && (trim(cms.tours_ex_endtime)==''))
          let isEveningSlot = (cms.tours_ex_duration == 'EVE')
          update tour 
          with {
              title: cms.title,
              isMealIncluded: cms.tours_ex_meals != '',
              styles: has(cms.Category, "21#Travel Styles - Experiences") ? values(cms.Category["21#Travel Styles - Experiences"]) : [],
              isPreferred: has(cms.Category, "15#EXO Preferred") ? position(attributes(cms.Category["15#EXO Preferred"]), '734') : false,
              isResponsible: has(cms.Category, "24#Specials") ? position(attributes(cms.Category["24#Specials"]), '1404') : false,
              durationSlots: cms.tours_ex_duration == 'FD' ? 2 : 1,
              timeSlots: {
                  durationType: cms.tours_ex_duration,
                  Morning: {
                      available: isMorningSlot,
                      pickupTime: morningPickUpTime,
                      dropoffTime: morningDropoffTime
                  },
                  Afternoon: {
                      available: isAfternoonSlot,
                      pickupTime: afternoonPickUpTime,
                      dropoffTime: afternoonDropoffTime
                  },
                  Evening: {
                      available: isEveningSlot,
                      pickupTime: evePickUpTime,
                      dropoffTime: eveDropoffTime
                  }
              },
              rate: {
                  summary: cms.tours_ex_from_price,
                  description: cms.tours_ex_from_price_desc
              },
              highlights: cms.tours_ex_highlights_list,
              introduction: substitute(cms.tours_ex_introduction, '\n', ''),
              inclusions: split(substitute(substitute(cms.tours_ex_inclusions, '<ul><li>', ''), '</li></ul>', ''), '</li><li>'),
              exclusions: split(substitute(substitute(cms.tours_ex_exclusions, '<ul><li>', ''), '</li></ul>', ''), '</li><li>'),
              notes: substitute(substitute(substitute(cms.tours_ex_notes, '\n', ''), '\t', ''), '<br />', ''),
              details: substitute(substitute(substitute(substitute(cms.tours_ex_programme, '\n', ''), '\t', ''), '<p>', ''), '</p>', ''),
              images:
              (
                let imgObjs = (for image in images
                    let img = contains(image.file_orignal, '/create1-') ? image.file_orignal : ''
                    let url = contains(image.file_orignal, '/create1-') ? concat(imgURL, substring(image.file_orignal, find_last(image.file_orignal, '/') + 1)) : ''
                    let imageObj = img != '' ? {description: image.description, file_original: img, url: url} : 0
                return imageObj)
                let res = minus(imgObjs, [0])
                let result = length(res) == 0 ? {url:''} : first(res)
                return result
              )
          } 
          in tours
    return {new: NEW}`;
  const count = db._query(aqlUpdate, { "@sourceCollection": sourceCollection, "@destinationCollection": destinationCollection }).toArray();
  return count.length;
}

function processSupplierData(sourceCollection, destinationCollection) {
  const aqlUpdate = `
    let imgURL = 'http://uncircled.asia/img/exo/'
    for cms in @@sourceCollection
        for supplier in @@destinationCollection
            filter cms.hotels_product_code == supplier.supplierCode
            let supplierImages = not_null(cms.hotels_images_gallery) ? cms.hotels_images_gallery : [{file_original: ""}]
            let classDescription = has(cms.Category, "5#Star Rating") ? first(values(cms.Category["5#Star Rating"])) : ''
            let classCode = translate(classDescription, {'First Class': 3, 'Superior': 4, 'Deluxe': 5, 'Super Deluxe': 6})
            let classStars = translate(classDescription, {'First Class': 3, 'Superior': 4, 'Deluxe': 5, 'Super Deluxe': 6})
            update supplier 
            with {
                    title: cms.title,
                    class: {
                        description: classDescription,
                        code: classCode,
                        stars: classStars
                    },
                    isPreferred: has(cms.Category, "15#EXO Preferred") ? position(attributes(cms.Category["15#EXO Preferred"]), '734') : false,
                    isResponsible: has(cms.Category, "24#Specials") ? position(attributes(cms.Category["24#Specials"]), '1404') : false,
                    details: substitute(substitute(substitute(substitute(cms.hotels_about_text, '\n', ''), '\t', ''), '<p>', ''), '</p>', ''),
                    images: (
                        let imageObjects = minus(
                            for image in supplierImages
                                let img = contains(image.file_orignal, '/create1-') ? image.file_orignal : ''
                                let url = contains(image.file_orignal, '/create1-') ? concat(imgURL, substring(image.file_orignal, find_last(image.file_orignal, '/') + 1)) : ''
                                let description = image.description
                            return img != '' ? {description: description, file_original: img, url: url} : 0
                        , [0])
                        return length(imageObjects) == 0 ? {url:''} : first(imageObjects)
                    )
                }
            in suppliers
    return {new: NEW}`;
  const count = db._query(aqlUpdate, { "@sourceCollection": sourceCollection, "@destinationCollection": destinationCollection }).toArray();
  return count.length;
}

function processAccommodationData(sourceCollection, destinationCollection) {
  const aqlUpdate = `
    for supplier in @@sourceCollection
      for accommodation in @@destinationCollection
          filter supplier.supplierId == accommodation.supplierId
          update accommodation 
          with {
              voucherName: supplier.title ? supplier.title : accommodation.voucherName,
              class: supplier.class ? supplier.class : accommodation.class,
              isPreferred: supplier.isPreferred ? supplier.isPreferred : accommodation.isPreferred,
              isResponsible: supplier.isResponsible ? supplier.isResponsible : accommodation.isResponsible,
              images: supplier.images ? supplier.images : {url:''}
          } 
          in accommodations
    return {new: NEW}`;
  const count = db._query(aqlUpdate, { "@sourceCollection": sourceCollection, "@destinationCollection": destinationCollection }).toArray();
  return count.length;
}

function importCMSTours() {
  console.log('Import tours...');
  const tourCMSCollection = 'tourCMS';
  db._drop(tourCMSCollection);
  db._create(tourCMSCollection);
  let offset = 0;
  const limit = 500;
  console.log(`Fetching products ${offset} - ${offset + limit}`);
  let fetchURL = getCMSTourURL(offset, limit);
  while (getCMSData(tourCMSCollection, offset, limit, fetchURL)) {
    offset += limit;
    fetchURL = getCMSTourURL(offset, limit);
    console.log(`Fetching products ${offset} - ${offset + limit}`);
  }
  console.log('Processing tour data...');
  const countNewRecords = processTourData(tourCMSCollection, 'tours');
  console.log(`${countNewRecords} tour records processed.`);
  //db._drop(tourCMSCollection);
  console.log('Done import tours!');
}

function importCMSSuppliers() {
  console.log('Import suppliers...');
  const suppliersCMSCollection = 'supplierCMS';
  db._drop(suppliersCMSCollection);
  db._create(suppliersCMSCollection);
  let offset = 0;
  const limit = 500;
  console.log(`Fetching products ${offset} - ${offset + limit}`);
  let fetchURL = getCMSSupplierURL(offset, limit);
  while (getCMSData(suppliersCMSCollection, offset, limit, fetchURL)) {
    offset += limit;
    fetchURL = getCMSSupplierURL(offset, limit);
    console.log(`Fetching products ${offset} - ${offset + limit}`);
  }
  console.log('Processing supplier data...');
  let countNewRecords = processSupplierData(suppliersCMSCollection, 'suppliers');
  console.log(`${countNewRecords} supplier records processed.`);
  console.log('Processing accommodation data...');
  countNewRecords = processAccommodationData('suppliers', 'accommodations');
  console.log(`${countNewRecords} accommodation records processed.`);
  //db._drop(suppliersCMSCollection);
  console.log('Done import suppliers!');
}

function doImport(importTours, importSuppliers) {
  if (importTours) {
    importCMSTours();
  }
  if (importSuppliers) {
    importCMSSuppliers();
  }
}

// Import
doImport(true, true);

module.exports = {
  doImport
};
