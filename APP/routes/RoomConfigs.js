'use strict';

const utils = require('../utils');
const RoomConfigs = require('../repositories/roomConfigs');
const router = require('@arangodb/foxx/router')();
module.exports = router;

const db = require('@arangodb').db;

/**
 * Get rooms by serviceBookingKey
 */
router.get('serviceBooking/:serviceBookingKey', (req, res) => {
  const {serviceBookingKey} = req.pathParams;
  const serviceBookingEdges = db.bookIn.byExample({_from: `serviceBookings/${serviceBookingKey}`}).toArray();
  res.json(serviceBookingEdges.map((edge) => db.roomConfigs.firstExample({_id: edge._to})));
});

/**
 * Create a new room and link it to a given serviceBookingKey
 */
router.post((req, res) => {
  const {roomType, serviceBookingKey} = req.body;
  const newRoom = db.roomConfigs.insert({roomType});
  utils.addToEdge('serviceBookings', serviceBookingKey, 'roomConfigs', newRoom._key, 'bookIn');
  res.json(newRoom);
})
    .body(require('../models/RoomConfigs'), 'The room configs linked to a serviceBooking');

/**
 * Update roomConfigs
 */
router.put(':roomConfigKey', (req, res) => {
  const {roomConfigKey} = req.pathParams;
  const {roomType, paxKeys} = req.body;

  // Update room
  db.roomConfigs.updateByExample({_key: roomConfigKey}, {roomType});

  // Remove all pax edges, and recreate them based on the given pax ids
  db.participate.removeByExample({_from: `roomConfigs/${roomConfigKey}`});
  paxKeys.forEach((paxKey) => {
    utils.addToEdge('roomConfigs', roomConfigKey, 'paxs', paxKey, 'participate');
  });
  res.json(db.roomConfigs.firstExample({_key: roomConfigKey}));
})
    .body(require('../models/RoomConfigs'), 'The room configs linked to a serviceBooking');

/**
 * Delete a room and its edges
 */
router.delete(':roomConfigKey', (req, res) => {
  const {roomConfigKey} = req.pathParams;
  const bookInEdges = db.bookIn.byExample({_to: `roomConfigs/${roomConfigKey}`}).toArray();
  const participateEdges = db.participate.byExample({_from: `roomConfigs/${roomConfigKey}`}).toArray();

  // Remove the roomConfigs and its edge
  db.roomConfigs.removeByKeys([roomConfigKey]);
  db.bookIn.remove(bookInEdges);
  db.participate.remove(participateEdges);

  res.sendStatus(204);
});


/**Check the status of all PAX in a roomConfig.
 *
 * Check the status of all PAX in a roomConfig
 */
router.post('/check-pax-status', function (req, res) {
  let tripKey = req.body.tripKey;
  let cityBookingKey = req.body.cityBookingKey;
  let roomConfigKey = req.body.roomConfigKey;
  let paxList = RoomConfigs.checkPAXStatuses(tripKey, cityBookingKey, roomConfigKey);
  res.json(paxList);
})
    .body(require('../models/roomconfigcheckpax'), 'The roomConfig you want to check PAX of');

/**Update the status of all PAX in a roomConfig.
 *
 * Update the status of all PAX in a roomConfig
 */
router.post('update-pax-statuses', function (req, res) {
  const roomConfigKey = req.body.roomConfigKey;
  const result = RoomConfigs.updateRoomConfigPaxes(roomConfigKey);
  res.json(result);
})
    .body(require('../models/updateRoomConfigPaxses'), 'The roomConfig you want to update PAX statuses for');
