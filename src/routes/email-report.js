const express = require('express');
const router = express.Router();
const { emailReport } = require('../controllers/dppController');
router.post('/', emailReport);
module.exports = router;