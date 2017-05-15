'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

const ImportAgentTours = require('../repositories/importAllAgentsTours');

router.post('/', function (req, res) {
  const {AgentID, Password, GenericSource} = req.body;
  const result = ImportAgentTours.getAllTours(AgentID, Password, GenericSource);
  res.json(result);
})
  .body(require('../models/agentInfo'), 'The agent you use to login on tourplan');

router.get('/', function (req, res) {
  const result = ImportAgentTours.importAllTours();
	res.json(result);
})
.error(404, 'The tour could not be found');
