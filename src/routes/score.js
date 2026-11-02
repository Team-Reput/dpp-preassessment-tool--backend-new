const express = require('express');
const router = express.Router();
const { getAssessmentScoreV2 } = require('../controllers/dppController');

// GET because we only read the score. :ass_id is a variable part of the URL.
router.get('/:ass_id', getAssessmentScoreV2);

module.exports = router;