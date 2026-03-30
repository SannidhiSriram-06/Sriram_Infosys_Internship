const path = require('path');
const fs = require('fs');
const Verification = require('../models/Verification');
const FormData = require('form-data');
const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Allowed document types that match the Mongoose enum
const ALLOWED_DOC_TYPES = ['Pan Card', 'Aadhaar Card', 'Passport', 'Non-KYC'];

/**
 * Normalize document_type to a value accepted by the DB enum.
 * Falls back to 'Pan Card' since PAN heuristic is the most common fallback.
 */
function normalizeDocumentType(raw) {
  const safeType = raw || 'Unknown';
  if (ALLOWED_DOC_TYPES.includes(safeType)) return safeType;
  // Common ML variations
  const lower = safeType.toLowerCase();
  if (lower.includes('pan')) return 'Pan Card';
  if (lower.includes('aadhaar') || lower.includes('aadhar')) return 'Aadhaar Card';
  if (lower.includes('passport')) return 'Passport';
  if (lower.includes('non-kyc') || lower === 'unknown') return 'Non-KYC';
  return 'Pan Card'; // safe fallback
}

/**
 * Extract a human-readable name from potentially inconsistent OCR data.
 */
function extractUserName(ocrData, fallback) {
  const safe = ocrData || {};
  return (
    safe.name ||
    safe['Full Name'] ||
    safe.full_name ||
    safe['Name'] ||
    (typeof safe.raw_text === 'string' && safe.raw_text.trim() ? safe.raw_text.trim() : null) ||
    fallback ||
    'Unknown'
  );
}

exports.verifyDocuments = async (req, res, next) => {
  try {
    if (!req.files || !req.files['identity']) {
      return res.status(400).json({
        success: false,
        error: 'Please upload an identity document'
      });
    }

    const identityFile = req.files['identity'][0];
    const supportingFiles = req.files['supporting'] || [];

    // --- Send file to ML service ---
    const filePath = path.resolve(identityFile.path);

    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    let mlResult;

    try {
      const mlResponse = await axios.post(
        `${ML_SERVICE_URL}/api/ml/classify`,
        formData,
        {
          headers: formData.getHeaders()
        }
      );

      mlResult = mlResponse.data;

      // Debug log to inspect ML response structure
      console.log("ML RESULT:", JSON.stringify(mlResult, null, 2));

    } catch (mlErr) {
      return res.status(502).json({
        success: false,
        error: `ML service unavailable: ${mlErr.message}`
      });
    }

    // --- SAFE ML parsing (flat structure from ML service) ---
    const safeOcr = mlResult?.ocr_data || {};
    const anomalyScore = mlResult?.anomaly_score ?? 0;
    const safeDocumentType = normalizeDocumentType(mlResult?.document_type);
    const safeExtractedData = mlResult?.extracted_data || safeOcr || {};
    const similarRecords = mlResult?.similar_records ?? [];

    const isNonKyc = safeDocumentType === 'Non-KYC';

    // Derive user_name from OCR with safe fallback chain
    const user_name = extractUserName(safeOcr, req.user?.name || 'Demo User');

    let status;
    if (isNonKyc) {
      status = 'Non-KYC';
    } else if (anomalyScore > 2.0) {
      status = 'Suspicious';
    } else {
      status = 'Approved';
    }

    // Build payload — NO undefined values
    const payload = {
      user_id: req.user?.id || 'demo-user',
      user_name,
      document_type: safeDocumentType,
      submitted_date: new Date(),
      anomaly_score: anomalyScore,
      status,
      extracted_data: safeExtractedData,
      similar_nodes: similarRecords,
      details: {
        documentStatus: isNonKyc ? 'Not a valid KYC document' : 'Verified',
        forgeryDetection: status,
        faceMatch: 'N/A',
        extractedName: extractUserName(safeOcr, ''),
        extractedAddress: '',
        ocrData: safeOcr,
        classScores: mlResult?.class_scores || null,
      },
      identityFile: identityFile.path,
      supportingFiles: supportingFiles.map(f => f.path)
    };

    console.log('[BACKEND] verifyDocuments payload:', JSON.stringify(payload, null, 2));

    // --- Save to DB ---
    const verification = await Verification.create(payload);

    res.status(200).json({
      success: true,
      data: verification,
      document_type: safeDocumentType,
      anomaly_score: anomalyScore,
      extracted_data: safeExtractedData,
      similar_records: similarRecords,
      is_non_kyc: isNonKyc,
      status
    });

  } catch (err) {
    console.error('❌ verifyDocuments error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.getHistory = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'demo-user';

    const verifications = await Verification.find({ user_id: userId })
      .sort('-submitted_date');

    res.status(200).json({
      success: true,
      count: verifications.length,
      data: verifications
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.getAllVerifications = async (req, res, next) => {
  try {
    const { status, docType, days } = req.query;
    let query = {};

    if (status && status !== 'All Status') {
      query.status = status;
    }

    if (docType && docType !== 'All Documents') {
      query.document_type = docType;
    }

    if (days && days !== 'All Time') {
      const daysNum = parseInt(days);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysNum);
      query.submitted_date = { $gte: cutoffDate };
    }

    const verifications = await Verification.find(query)
      .sort('-submitted_date')
      .limit(1000)
      .lean();

    const serialized = verifications.map(v => ({
      ...v,
      _id: v._id?.toString()
    }));

    res.status(200).json({
      success: true,
      count: serialized.length,
      data: serialized
    });

  } catch (err) {
    console.error('❌ getAllVerifications:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.getVerificationStats = async (req, res, next) => {
  try {
    const total = await Verification.countDocuments();
    const approved = await Verification.countDocuments({ status: 'Approved' });
    const suspicious = await Verification.countDocuments({ status: 'Suspicious' });
    const rejected = await Verification.countDocuments({ status: 'Rejected' });
    const nonKyc = await Verification.countDocuments({ status: 'Non-KYC' });

    res.status(200).json({
      success: true,
      data: { total, approved, suspicious, rejected, nonKyc }
    });

  } catch (err) {
    console.error('❌ getVerificationStats:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.saveVerification = async (req, res, next) => {
  try {
    const { user_id, user_name, document_type, anomaly_score, status, extracted_data, ocr_data, similar_nodes } = req.body;

    const safeOcr = ocr_data || {};
    const safeExtractedData = extracted_data || safeOcr || {};
    const safeDocumentType = normalizeDocumentType(document_type);
    const safeName = extractUserName(safeOcr, user_name);
    const safeAnomalyScore = anomaly_score ?? 0;

    const payload = {
      user_id: user_id || 'demo-user',
      user_name: safeName,
      document_type: safeDocumentType,
      submitted_date: new Date(),
      anomaly_score: safeAnomalyScore,
      status: status || 'Approved',
      extracted_data: safeExtractedData,
      similar_nodes: similar_nodes || []
    };

    console.log('[BACKEND] saveVerification payload:', JSON.stringify(payload, null, 2));

    const verification = await Verification.create(payload);

    res.status(201).json({
      success: true,
      data: verification
    });

  } catch (err) {
    console.error('❌ saveVerification:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.saveManualDecision = async (req, res, next) => {
  try {
    const { user_name, document_type, anomaly_score, status, extracted_data, ocr_data, similar_nodes } = req.body;

    const safeOcr = ocr_data || {};
    const safeExtractedData = extracted_data || safeOcr || {};
    const safeDocumentType = normalizeDocumentType(document_type);
    const safeName = extractUserName(safeOcr, user_name);
    const safeAnomalyScore = anomaly_score ?? 0;
    const safeStatus = status || 'Approved';

    const payload = {
      user_id: 'admin',
      user_name: safeName,
      document_type: safeDocumentType,
      submitted_date: new Date(),
      anomaly_score: safeAnomalyScore,
      status: safeStatus,
      extracted_data: safeExtractedData,
      similar_nodes: similar_nodes || []
    };

    console.log('[BACKEND] saveManualDecision payload:', JSON.stringify(payload, null, 2));

    const verification = await Verification.create(payload);

    res.status(201).json({
      success: true,
      verification_id: verification._id.toString(),
      data: verification
    });

  } catch (err) {
    console.error('❌ saveManualDecision:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.resetVerifications = async (req, res, next) => {
  try {
    if (NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        error: 'Reset only available in development mode'
      });
    }

    const result = await Verification.deleteMany({});

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} documents`,
      deleted: result.deletedCount
    });

  } catch (err) {
    console.error('❌ resetVerifications:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};