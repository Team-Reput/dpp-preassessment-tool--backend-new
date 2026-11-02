const express = require('express');
const router = express.Router();
const { insertComplianceCertification } = require('../controllers/dppController');
router.post('/', insertComplianceCertification);
module.exports = router;