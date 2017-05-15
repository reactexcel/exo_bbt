'use strict';
const router = require('@arangodb/foxx/router')();
module.exports = router;

const Convert = require('../repositories/convert');

/** Create file base64.
 *
 * Create file base64
 */
router.post('/getBase64', function (req, res) {
  const { tripKey, showDayNotes, showImages, showDescriptions, showCategoryAmounts, showLineAmounts } = req.body;
  console.log(`tripKey ${tripKey}, showDayNotes ${showDayNotes}, showImages ${showImages}, showDescriptions ${showDescriptions}, showCategoryAmounts ${showCategoryAmounts}, showLineAmounts ${showLineAmounts}`);
  const base64File = Convert.getBase64File(tripKey, showDayNotes, showImages, showDescriptions, showCategoryAmounts, showLineAmounts);
  res.json({fileBase64: base64File});
})
  .body(require('../models/toWordURL'), 'Create Word document URL');


/** Get convertio dataId.
 *
 * Get convertio dataId
 */
router.post('/getDataId', function (req, res) {
  const { fileBase64, fileName } = req.body;
  const dataId = Convert.getDataId(fileBase64, fileName);
  res.json(dataId);
})
  .body(require('../models/base64File'), 'Create convertio dataId');

/** Get dataId status.
 *
 * Get dataId status.
 */
router.post('/checkStatus', function (req, res) {
  const { conversionID } = req.body;
  const status = Convert.checkStatus(conversionID);
  res.json(status);
})
  .body(require('../models/conversionID'), 'Check conversion status');


/** Get convertio file content.
 *
 * Get convertio file content
 */
router.post('/getFileContent', function (req, res) {
  const { conversionID } = req.body;
  const fileContent = Convert.getFileContent(conversionID);
  res.json(fileContent);
})
  .body(require('../models/conversionID'), 'Get convertio file content');

/** Save file content.
 *
 * Save file content
 */
router.post('/saveFile', function (req, res) {
  const { contentBase64, saveToPath, saveToFileName } = req.body;
  const fileURL = Convert.saveFileToLocal(contentBase64, saveToPath, saveToFileName);
  res.json({ fileURL: fileURL });
})
  .body(require('../models/saveFile'), 'Create convertio dataId');

/** Convert trip to word.
 *
 * Convert trip to word.
 */
router.post('/tripToWord', function (req, res) {
  const { tripKey, showDayNotes, showImages, showDescriptions, showCategoryAmounts, showLineAmounts, localPath } = req.body;
  const fileURL = Convert.convertTripToWord(tripKey, showDayNotes, showImages, showDescriptions, showCategoryAmounts, showLineAmounts, localPath);
  res.json({ url: fileURL });
})
  .body(require('../models/toWordURL'), 'Convert trip to word.');

