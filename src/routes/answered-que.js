const express = require('express');
const router = express.Router();
const { insertAnsweredQue } = require('../controllers/dppController');

router.post('/', insertAnsweredQue);

module.exports = router;