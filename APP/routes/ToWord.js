'use strict';
const fs = require('fs');
const router = require('@arangodb/foxx/router')();
const Base64 = require('js-base64').Base64;
const request = require('@arangodb/request');
module.exports = router;
const db = require('@arangodb').db;

let exoConvertioAPIKey = 'fef0aa216362d87a5314328551f324e1'; // Brian EXO
const convertioBaseURL = 'http://api.convertio.co/convert';
const aqlCountryBookingStructureQuery = `
let tripId = concat('trips/', @tripKey)
let trip = document(tripId)

let countryBookings = (for cbKey in trip.countryOrder
    let cbId = concat('countryBookings/', cbKey)
    let cb = document(cbId)
    return {
        id: cb._id,
        country: cb.countryCode,
        cities: (
            for cityBookingKey in cb.cityOrder
                let cityBookingId = concat('cityBookings/', cityBookingKey)
                let cityBooking = document(cityBookingId)
                let cityDays = (
                    for cityDayKey in cityBooking.dayOrder
                        let cityDayId = concat('cityDays/', cityDayKey)
                        let cityDay = document(cityDayId)
                        let tourServiceBookings = (
                            for serviceBooking in 1..1 outbound cityDayId graph 'exo-dev'
                                filter is_same_collection('serviceBookings', serviceBooking)
                                let tour = FIRST(
                                    for _tour in 1..1 outbound serviceBooking._id graph 'exo-dev'
                                        filter is_same_collection('tours', _tour)
                                    return {
                                        //tour: _tour,
                                        id: _tour._id,
                                        title: _tour.title,
                                        voucherName: _tour.voucherName,
                                        comment: _tour.comment,
                                        description: _tour.description,
                                        durationSlots: _tour.durationSlots,
                                        imageURL: FIRST(_tour.images).url
                                    }
                                )
                            return {
                                //serviceBooking: serviceBooking,
                                id: serviceBooking._id,
                                startSlot: serviceBooking.startSlot,
                                durationSlots: serviceBooking.durationSlots,
                                currency: serviceBooking.price.currency,
                                price: serviceBooking.price.amount,
                                tour: tour
                            }
                        ),
                        accommodationPlacemetServiceBooking = (
                            for accommodationPlacemet in 1..1 outbound cityBookingId graph 'exo-dev'
                                filter is_same_collection('accommodationPlacements', accommodationPlacemet) && 
                                    (accommodationPlacemet.startDay == cityDay.startDay)
                                let accommodationPlacemetServiceBooking = (
                                    for serviceBooking in 1..1 outbound accommodationPlacemet._id graph 'exo-dev'
                                        filter is_same_collection('serviceBookings', serviceBooking)
                                        let accommodation = FIRST(
                                            for _accommodation in 1..1 outbound serviceBooking._id graph 'exo-dev'
                                                filter is_same_collection('accommodations', _accommodation)
                                                let supplier = document(concat('suppliers/', _accommodation.supplierId))
                                                return {
                                                    //accommodation: _accommodation,
                                                    id: _accommodation._id,
                                                    title: _accommodation.title,
                                                    voucherName: _accommodation.voucherName,
                                                    currency: serviceBooking.price.currency,
                                                    price: serviceBooking.price.amount,
                                                    imageURL: First(supplier.images).url
                                                }
                                        )
                                        let roomConfigs = (
                                            for roomConfig in 1..1 outbound serviceBooking._id graph 'exo-dev'
                                                filter is_same_collection('roomConfigs', roomConfig)
                                                let paxs = (
                                                    for pax in 1..1 outbound roomConfig._id graph 'exo-dev'
                                                        filter is_same_collection('paxs', pax)
                                                        return {
                                                            //pax: pax,
                                                            id: pax._id,
                                                            ageGroup: pax.ageGroup,
                                                            ageOnArrival: pax.ageOnArrival,
                                                            dateOfBirth: pax.dateOfBirth,
                                                            firstName: pax.firstName,
                                                            lastName: pax.lastName,
                                                            gender: pax.gender
                                                        }
                                                    )  
                                            return {
                                                //roomConfig: roomConfig,
                                                id: roomConfig._id,
                                                roomType: roomConfig.roomType,
                                                paxs: paxs
                                            }
                                        )
                                        return { 
                                            accommodation: accommodation,
                                            roomConfigs: roomConfigs 
                                        }
                                )
                            return {
                                //accommodationPlacemet: accommodationPlacemet,
                                id: accommodationPlacemet._id,
                                durationNights: accommodationPlacemet.durationNights,
                                startDate: accommodationPlacemet.startDate,
                                startDay: accommodationPlacemet.startDay,
                                accommodationPlacemetServiceBookings: accommodationPlacemetServiceBooking
                            }
                        ), // accommodationPlacemetServiceBooking
                        transferPlacementServiceBooking = (
                            for transferPlacement in 1..1 outbound cityBookingId graph 'exo-dev'
                                filter is_same_collection('transferPlacements', transferPlacement) && (LENGTH(transferPlacement.serviceBookingOrder) > 0) && (transferPlacement.startDate == cityDay.startDate)
                                let serviceBookings = (
                                    for serviceBookingKey in transferPlacement.serviceBookingOrder
                                        let serviceBookingId = concat('serviceBookings/', serviceBookingKey)
                                        let serviceBooking = document(serviceBookingId)
                                        let transfer = FIRST(
                                            for transfer in 1..1 outbound serviceBookingId graph 'exo-dev'
                                                filter is_same_collection('transfers', transfer)
                                            return transfer
                                        )
                                    return {
                                        // serviceBooking: serviceBooking,
                                        id: serviceBooking._id,
                                        startSlot: serviceBooking.startSlot,
                                        durationSlots: serviceBooking.durationSlots,
                                        currency: serviceBooking.price.currency,
                                        price: serviceBooking.price.amount,
                                        route: serviceBooking.route,
                                        transfer: {
                                            //transfer: transfer,
                                            id: transfer._id,
                                            title: transfer.title,
                                            from: transfer.route.from.cityName,
                                            to: transfer.route.to.cityName,
                                            voucherName: transfer.voucherName,
                                            category: transfer.category,
                                            class: transfer.class,
                                            vehicle: transfer.vehicle
                                        }
                                    }
                                )
                            return {
                                transferPlacement: {
                                    id: transferPlacement._id,
                                    durationDays: transferPlacement.durationDays,
                                    durationNights: transferPlacement.durationNights,
                                    startDate: transferPlacement.startDate
                                },
                                serviceBookings: serviceBookings
                            }
                        )
                    return {
                        //cityDay: cityDay,
                        id: cityDay._id,
                        startDate: cityDay.startDate,
                        startDay: cityDay.startDay,
                        timeSlots: cityDay.timeSlots,
                        note: cityDay.note,
                        tours: tourServiceBookings,
                        accommodationPlacements: accommodationPlacemetServiceBooking,
                        transferPlacements: transferPlacementServiceBooking
                    }
                )
                return {
                    id: cityBooking._id,
                    cityName: cityBooking.cityCode, 
                    durationDays: cityBooking.durationDays, 
                    durationNights: cityBooking.durationNights, 
                    startDay: cityBooking.startDay, 
                    startDate: cityBooking.startDate,
                    cityDays: cityDays
                }
    )}
)

return countryBookings`;
let amountHotels = 0;
let amountTours = 0;
let amountTransfers = 0;
let amountDays = {};

function calculateAmounts(countryBookings) {
  amountDays = {};
  countryBookings.map((country) => {
    country.cities.map((city) => {
      city.cityDays.map((day) => {
        let dayAmount = 0;
        day.tours.map((tour) => {
          amountTours += tour.price;
          dayAmount += tour.price;
        });
        day.transferPlacements.map((transferPlacement) => {
          transferPlacement.serviceBookings.map((serviceBooking) => {
            amountTransfers += serviceBooking.price;
            dayAmount += serviceBooking.price;
          });
        });
        day.accommodationPlacements.map((accommodationPlacement) => {
          accommodationPlacement.accommodationPlacemetServiceBookings.map((serviceBooking) => {
            if (serviceBooking.accommodation) {
              amountHotels += serviceBooking.accommodation.price;
              dayAmount += serviceBooking.accommodation.price;
            }
          });
        });
        amountDays[day.id] = dayAmount;
      });
    });
  });
}

function saveToStream(countryBookings, showDayNotes, showImages, showDescription, showCategoryAmounts, showLineAmounts, debug) {
  calculateAmounts(countryBookings);
  let result = [];
  countryBookings.map((country) => {
    if (debug) { console.log(`Country: ${country.country}`); }
    result.push(`Country: ${country.country}`);
    if (showCategoryAmounts) {
      if (debug) {
        console.log(`Hotels: ${amountHotels} $`);
        console.log(`Tours: ${amountTours} $`);
        console.log(`Transfers: ${amountTransfers} $`);
        console.log(`Total: ${amountHotels + amountTours + amountTransfers} $`);
      }
      result.push(`Amount: Hotels: ${amountHotels} $ Tours: ${amountTours} $ Transfers: ${amountTransfers} $ Total: ${amountHotels + amountTours + amountTransfers} $`);
    }
    country.cities.map((city) => {
      if (debug) {
        console.log(`City: ${city.cityName} StartDay: ${city.startDay} Date: ${city.startDate}`);
      }
      result.push(`City: ${city.cityName} StartDay: ${city.startDay} Date: ${city.startDate}`);
      city.cityDays.map((day) => {
        let dayNote = (showDayNotes && day.note) ? `Note: ${day.note}` : ``;
        let BrkLncDinMessage = (day.timeSlots) ? `Breakfast ${day.timeSlots[0].meal.type}. Lunch ${day.timeSlots[1].meal.type}. Dinner ${day.timeSlots[2].meal.type}.` : `Breakfast is not arranged. Lunch is not arranged. Dinner is not arranged.`;
        if (debug) {
          console.log(`Day: ${day.startDay} Date: ${day.startDate}`);
        }
        result.push(`Day: ${day.startDay} Date: ${day.startDate}`);
        if (debug) {
          console.log(`${dayNote}`);
        }
        result.push(`${dayNote}`);
        if (debug) {
          console.log(`${BrkLncDinMessage}`);
        }
        result.push(`${BrkLncDinMessage}`);
        if (showLineAmounts) {
          if (debug) {
            console.log(`Amount: ${amountDays[day.id]} $`);
          }
          result.push(`Amount: ${amountDays[day.id]} $`);
        }
        day.tours.map((tour) => {
          if (tour.tour) {
            let imageURL = showImages ? ` ImageURL: ${tour.tour.imageURL}` : ``;
            let description = showDescription ? ` Description: ${tour.tour.description}` : ``;
            if (debug) {
              console.log(`Tour: ${tour.tour.title} Start slot: ${tour.startSlot} Duration: ${tour.durationSlots}${imageURL}${description}`);
            }
            result.push(`Tour: ${tour.tour.title} Start slot: ${tour.startSlot} Duration: ${tour.durationSlots}${imageURL}${description}`);
          }
        });
        day.accommodationPlacements.map((accommodationPlacement) => {
          if (debug) {
            console.log(`Accommodation placement: StartDay: ${accommodationPlacement.startDay} Date: ${accommodationPlacement.startDate}`);
          }
          result.push(`Accommodation placement: StartDay: ${accommodationPlacement.startDay} Date: ${accommodationPlacement.startDate}`);
          accommodationPlacement.accommodationPlacemetServiceBookings.map((serviceBooking) => {
            if (serviceBooking.accommodation) {
              let imageURL = showImages ? ` ImageURL: ${serviceBooking.accommodation.imageURL}` : ``;
              let description = showDescription ? ` Description: ${serviceBooking.accommodation.description}` : ``;
              if (debug) {
                console.log(`Accommodation: Voucher name: ${serviceBooking.accommodation.voucherName} Title: ${serviceBooking.accommodation.title} Currency: ${serviceBooking.accommodation.currency} Amount: ${serviceBooking.accommodation.price}${imageURL}${description}`);
              }
              result.push(`Accommodation: Voucher name: ${serviceBooking.accommodation.voucherName} Title: ${serviceBooking.accommodation.title} Currency: ${serviceBooking.accommodation.currency} Amount: ${serviceBooking.accommodation.price}${imageURL}${description}`);
            }
          });
        });
        day.transferPlacements.map((transferPlacement) => {
          transferPlacement.serviceBookings.map((serviceBooking) => {
            if (debug) {
              console.log(`Transfer: ${serviceBooking.route.from} - ${serviceBooking.route.to}`);
            }
            result.push(`Transfer: ${serviceBooking.route.from} - ${serviceBooking.route.to}`);
            if (debug) {
              console.log(`transfer ${serviceBooking.transfer.title}`);
            }
            result.push(`transfer ${serviceBooking.transfer.title}`);

          });
        });
      });
    });
  });
  return result.join('\n');
}

function saveToHTMLStream(countryBookings, showDayNotes, showImages, showDescriptions, showCategoryAmounts, showLineAmounts, debug) {
  calculateAmounts(countryBookings);
  let result = [];
  result.push('<!DOCTYPE html>');
  result.push('<html>');
  result.push('<body>');
  countryBookings.map((country) => {
    if (debug) { console.log(`Country: ${country.country}`); }
    result.push(`<h1>${country.country}</h1>`);
    if (showCategoryAmounts) {
      if (debug) {
        console.log(`Hotels: ${amountHotels} $`);
        console.log(`Tours: ${amountTours} $`);
        console.log(`Transfers: ${amountTransfers} $`);
        console.log(`Total: ${amountHotels + amountTours + amountTransfers} $`);
      }
      result.push(`<p>Hotels: ${amountHotels} $ Tours: ${amountTours} $ Transfers: ${amountTransfers} $ Total: ${amountHotels + amountTours + amountTransfers} $</p>`);
    }
    country.cities.map((city) => {
      if (debug) {
        console.log(`City: ${city.cityName} StartDay: ${city.startDay} Date: ${city.startDate}`);
      }
      result.push(`<h2>${city.cityName}</h2>`);
      city.cityDays.map((day) => {
        let dayNote = (showDayNotes && day.note) ? `<p>${day.note}</p><br>` : ``;
        let BrkLncDinMessage = (day.timeSlots) ? `Breakfast ${day.timeSlots[0].meal.type}. Lunch ${day.timeSlots[1].meal.type}. Dinner ${day.timeSlots[2].meal.type}.` : `Breakfast is not arranged. Lunch is not arranged. Dinner is not arranged.`;

        if (debug) {
          console.log(`Day: ${day.startDay} Date: ${day.startDate}`);
        }
        result.push(`<p><p style="margin-left: 0; clear: both"><b>Day ${day.startDay}</b>  ${day.startDate}</p>`);
        if (showLineAmounts) {
          if (debug) {
            console.log(`Amount: ${amountDays[day.id]} $`);
          }
          result.push(`<p style="margin-left: 20pt;"><b>Amount: ${amountDays[day.id]} $</b></p>`);
        }
        if (debug) {
          console.log(`${dayNote}`);
        }
        result.push(`${dayNote}`);
        if (debug) {
          console.log(`${BrkLncDinMessage}`);
        }
        result.push(`<p style="color:#DAA520;margin-left: 20pt"><b>${BrkLncDinMessage}</b></p>`);

        day.tours.map((tour) => {
          if (tour.tour) {
            let imageURL = showImages ? `<img src="${tour.tour.imageURL}" width="200" height="200" style="margin: 0pt 20pt;float: left;"/>` : ``;
            let description = (showDescriptions && tour.tour.description) ? `<p style="margin: 0pt 20pt;">${tour.tour.description}</p>` : ``;
            if (debug) {
              console.log(`Tour: ${tour.tour.title} Start slot: ${tour.startSlot} Duration: ${tour.durationSlots}${imageURL}${description}`);
            }
            result.push(`<p><p style="margin: 20pt;"><b>${tour.tour.title}</b></p><p>${imageURL}${description}</p></p>`);
          }
        });
        day.accommodationPlacements.map((accommodationPlacement) => {
          let accPlacemant = '';
          let firstServiceBooking = true;
          accommodationPlacement.accommodationPlacemetServiceBookings.map((serviceBooking) => {
            if (serviceBooking.accommodation) {
              let imageURL = showImages ? `<img src="${serviceBooking.accommodation.imageURL}" width="200" height="200" style="margin-left: 20pt; margin-right: 20pt;float: left;"/>` : ``;
              let description = (showDescriptions && serviceBooking.accommodation.description) ? `<p>${serviceBooking.accommodation.description}</p>` : ``;
              if (firstServiceBooking) {
                accPlacemant = `<p><p style="margin-left: 20pt;"><b>${serviceBooking.accommodation.voucherName}</b></p>${imageURL}${description}</p>`;
                firstServiceBooking = false;
              }
              if (debug) {
                console.log(`Accommodation: Voucher name: ${serviceBooking.accommodation.voucherName} Title: ${serviceBooking.accommodation.title} Currency: ${serviceBooking.accommodation.currency} Amount: ${serviceBooking.accommodation.price}${imageURL}${description}`);
              }
              result.push(`<p style="color:	#A9A9A9;margin-left: 20pt;"><b>${serviceBooking.accommodation.voucherName} - ${serviceBooking.accommodation.title}</b></p>`);
            }
          });
          result.push(accPlacemant);
        });
        day.transferPlacements.map((transferPlacement) => {
          transferPlacement.serviceBookings.map((serviceBooking) => {
            if (debug) {
              console.log(`Transfer: ${serviceBooking.route.from} - ${serviceBooking.route.to}`);
            }
            result.push(`<p style="margin-left: 20pt;"><b>${serviceBooking.route.from} - ${serviceBooking.route.to}</b></p><br>`);
            if (debug) {
              console.log(`transfer ${serviceBooking.transfer.title}`);
            }
            result.push(`<p style="margin-left: 20pt;"><b>${serviceBooking.transfer.title}</b></p><br>`);
          });
        });
        result.push('</p>');
      });
    });
  });
  result.push('</body>');
  result.push('</html>');
  return result.join('');
  //return result.join('\n');
}
function getCountryBookings(tripKey) {
  const countryBookingStructure = db._query(aqlCountryBookingStructureQuery, {tripKey}).next();
  return countryBookingStructure;
}

function getDoc64(countryBookings, args) {
  const doPrintDebug = false;
  const {showDayNotes, showImages, showDescriptions, showCategoryAmounts, showLineAmounts} = args;
  const docStr = saveToHTMLStream(countryBookings, showDayNotes, showImages, showDescriptions, showCategoryAmounts, showLineAmounts, doPrintDebug);
  const docStr64 = Base64.encode(docStr);
  return docStr64;
}

function getDataId(docStr64, tripKey) {
  let dataId = null;
  const convertioAPIKey = exoConvertioAPIKey;
  const reqArgs = `{"apikey": "${convertioAPIKey}", "input": "base64", "file": "${docStr64}", "filename": "${tripKey}.html", "outputformat":"doc"}`;
  console.log(`reqArgs: ${reqArgs}`);
  let convertioReturn = request({
    method: 'POST',
    url: convertioBaseURL,
    body: reqArgs,
    timeout: 30000
  });
  if (convertioReturn.body) {
    console.log(`HTTP request result: ${JSON.parse(convertioReturn.body)}`);
    const dataIdRes = JSON.parse(convertioReturn.body);
    if ((dataIdRes.code === 200) && (dataIdRes.status === 'ok')) {
      dataId = dataIdRes.data.id;
      console.log('dataId:', dataId);
    }
  }
  return dataId;
}

function getURL(dataId) {
  let URL = {wordFileURL: ''};
  // console.log(`${convertioBaseURL}/${dataId}/status`, dataId);
  let convertioReturn = request({
    method: 'GET',
    url: `${convertioBaseURL}/${dataId}/status`,
    timeout: 30000
  });
  const fileStatus = JSON.parse(convertioReturn.body);
  // console.log(fileStatus);
  if ((fileStatus.code === 200) && (fileStatus.status === 'ok')) {
    if ((fileStatus.data) && (fileStatus.data.step === 'finish') && (fileStatus.data.step_percent === 100)) {
      URL = {wordFileURL: fileStatus.data.output.url};
    }
  }
  return URL;
}
function waitSeconds(iMilliSeconds, dataId) {
  let newURL = {wordFileURL: ''};
  let counter = 0;
  let start = new Date().getTime();
  let end = 0;
  let done = newURL.wordFileURL !== '';
  while ((counter < iMilliSeconds) && (!done)) {
    end = new Date().getTime();
    counter = end - start;
    newURL = getURL(dataId);
    done = newURL.wordFileURL !== '';
    console.log(`counter ${counter}, URL: ${JSON.stringify(newURL.wordFileURL)}`);
  }
  return newURL;
}

function downloadFile(url, fileName) {
  let resultURL = '';
  //const localPath = `../www/docs/`;
  const localPath = `development/uncircled/quickplan/storage/`;
  const localFile = `${localPath}${fileName}.doc`;
  const localUrl = `http://docs.create.exotravel.com/${fileName}.doc`;
  console.log(`Download file url: ${url}`);
  let httpReturn = request({
    method: 'GET',
    url: url,
    // headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    timeout: 30000
  });
  let result = {
    statusCode: httpReturn.statusCode,
    headers: httpReturn.headers,
    message: httpReturn.message
  };
  console.log(JSON.stringify(result));
  let status = httpReturn.statusCode;
  if (status === 200) {
    if (!fs.exists(localPath)) {
      console.log(`Create dir ${localPath}`);
      fs.makeDirectory(localPath);
    }
    console.log(`Write file ${localPath}`);
    fs.write(localFile, httpReturn.rawBody);
    resultURL = localUrl;
  }
  return {
    statusCode: httpReturn.statusCode,
    headers: httpReturn.headers,
    message: httpReturn.message,
    URL: resultURL,
    localPath: localPath,
    localFile: localFile
  };
}

router.post('/wordURL', function (req, res) {
  const { tripKey } = req.body;
  console.log(`Get trip structure.`);
  const countryBookings = getCountryBookings(tripKey);
  let newURL = '';
  console.log(`Get doc base64.`);
  const doc64 = getDoc64(countryBookings, req.body);
  console.log(`Get dataId.`);
  const dataId = getDataId(doc64, tripKey);
  let localWordFileRequest = { URL: '' };
  console.log(`Get file url.`);
  newURL = waitSeconds(45000, dataId);
  console.log(`File to download: ${newURL.wordFileURL}`);
  /*if (newURL.wordFileURL !== '') {
    let dlURL = newURL.wordFileURL.replace('https://', 'http://');
      localWordFileRequest = downloadFile(dlURL, tripKey);
    }*/
  res.json({
    url: newURL.wordFileURL,
    doc64: doc64,
    dataId: dataId,
    convertioFileURL: newURL.wordFileURL,
    statusCode: localWordFileRequest.statusCode,
    headers: localWordFileRequest.headers,
    message: localWordFileRequest.message
  });

})
  .body(require('../models/toWordURL'), 'Create Word document URL');

router.post('/word-get-list-dir', function (req, res) {
  const { dir } = req.body;
  // if (fs.isDirectory(dir)) {
  //   fs.write(`${dir}temp.txt`, 'Hello world!');
  // }
  res.json({
    dirs: fs.list(dir)
  });
})
  .body(require('../models/getWordFile'), 'Download word file.');

router.post('/', function (req, res) {
  const {tripKey} = req.body;
  const countryBookings = getCountryBookings(tripKey);
  res.json(countryBookings);
})
  .body(require('../models/toWord'), 'Create CountryBooking structure for Word document');

