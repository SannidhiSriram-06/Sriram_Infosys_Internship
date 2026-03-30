const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyDocuments, getHistory, getAllVerifications, getVerificationStats, saveVerification, saveManualDecision, resetVerifications } = require('../controllers/kyc');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Setup Multer Storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync('uploads/')) {
      fs.mkdirSync('uploads/');
    }
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Error: Images and PDFs only!');
    }
  }
});

// ✅ Public endpoints - no authentication required (for demo/public access)
router.get('/verifications', getAllVerifications);
router.get('/verifications/stats', getVerificationStats);
router.post('/verifications', saveVerification);
router.post('/verifications/manual-decision', saveManualDecision);
router.post('/verifications/reset', resetVerifications); // Development only

// ✅ Protected routes
router.use(protect);

router.post('/verify', upload.fields([
  { name: 'identity', maxCount: 1 },
  { name: 'supporting', maxCount: 5 }
]), verifyDocuments);

router.get('/history', getHistory);

module.exports = router;
