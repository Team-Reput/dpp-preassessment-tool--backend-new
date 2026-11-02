const express = require('express');
const router = express.Router();                       // a mini-app that holds URLs for this feature
const { getAllQuestions } = require('../controllers/dppController'); // bring in the function from Step 1

// GET (not POST) because we only read data, we don't save anything.
// '/' means "no extra path". The full URL is decided in server.js.
router.get('/', getAllQuestions);

module.exports = router;                               // share it so server.js can use it