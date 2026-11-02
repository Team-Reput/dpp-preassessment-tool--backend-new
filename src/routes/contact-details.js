const express = require('express');
const router = express.Router();
const { insertContactDetails, updateContactProfile } = require('../controllers/dppController');

router.post('/', insertContactDetails);
router.post('/profile', updateContactProfile);   // POST /api/contact-details/profile

module.exports = router;