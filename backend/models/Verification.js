const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: false,
    default: 'admin'
  },
  user_name: {
    type: String,
    required: false,
    default: 'Unknown'
  },
  document_type: {
    type: String,
    enum: ['Pan Card', 'Aadhaar Card', 'Passport', 'Non-KYC'],
    required: true
  },
  submitted_date: {
    type: Date,
    default: Date.now
  },
  anomaly_score: {
    type: Number,
    required: false,
    default: 0
  },
  status: {
    type: String,
    enum: ['Approved', 'Suspicious', 'Rejected', 'Non-KYC'],
    default: 'Pending'
  },
  extracted_data: {
    type: Object,
    default: null
  },
  similar_nodes: {
    type: Array,
    default: []
  },
  // Keep legacy fields for backward compatibility
  details: {
    faceMatch: String,
    forgeryDetection: String,
    documentStatus: String,
    extractedName: String,
    extractedAddress: String,
    ocrData: {
      type: Object,
      default: null
    },
    classScores: {
      type: Object,
      default: null
    }
  },
  identityFile: String,
  supportingFiles: [String]
});

module.exports = mongoose.model('Verification', verificationSchema);
