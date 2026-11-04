const express = require('express');
const router = express.Router();
const{insertDemoRequest} = require('../controllers/dppController');

router.post('/', insertDemoRequest);

module.exports = router;
