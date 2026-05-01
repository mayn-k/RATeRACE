'use strict';
const { Router } = require('express');
const auth   = require('../middleware/auth');
const { pdf: upload } = require('../middleware/upload');
const ctrl   = require('../controllers/resume.controller');

const router = Router();

router.post('/upload',   auth, upload.single('file'), ctrl.uploadResume);
router.post('/linkedin', auth, ctrl.linkedinResume);

module.exports = router;
