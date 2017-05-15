'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

const db = require('@arangodb').db;
const request = require('@arangodb/request');
const Tours = require('../repositories/tours');
const allTours = require('../repositories/tours').allTours;

/** Lists of all tours in local storage.
 *
 * This function simply returns the list of all Tour.
 */
router.get('/', function (req, res) {
  var aqlQuery = `FOR tour in @@collection RETURN tour`;
  var result = db._query(aqlQuery, {'@collection': 'tours'}).toArray();
  if (result) {
    res.json(result);
  } else {
    res.json([]);
  }
});


/** Delete all tours in local storage.
 *
 * This function simply truncate the tours collection.
 */
router.delete('/', function (req, res) {
  Tours.clearTours();
  var tours = allTours();
  res.json(tours);
});