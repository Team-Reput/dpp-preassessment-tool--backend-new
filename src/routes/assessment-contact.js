const express = require('express');
const router = express.Router();
const { insertAssessmentContact } = require('../controllers/dppController');

router.post('/', insertAssessmentContact);

module.exports = router;