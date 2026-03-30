import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./VerificationResult.css";
import { API_BASE } from '../config.js';

const VerificationResult = ({ result, onStartNew, onVerificationSaved }) => {
  const navigate = useNavigate();
  const [savingStatus, setSavingStatus] = useState(null); // 'loading', 'success', 'error'
  const [selectedDecision, setSelectedDecision] = useState(null); // 'Approved', 'Suspicious', 'Rejected', 'Non-KYC'
  
  if (!result) return null;

  const { is_non_kyc, document_type, extracted_data, anomaly_score, status, similar_records } = result;
  
  // Determine status based on anomaly score
  const getApprovalStatus = (score) => {
    return (score ?? 0) < 2.0 ? "Approved" : "Suspicious";
  };

  // Color coding for anomaly score
  const getScoreColor = (score) => {
    if ((score ?? 0) < 1.5) return "#10B981"; // Green - low anomaly
    if ((score ?? 0) < 2.0) return "#FBBF24"; // Yellow - moderate anomaly
    return "#EF4444"; // Red - high anomaly
  };

  const getAnomalyLabel = (score) => {
    if ((score ?? 0) < 1.5) return "Low anomaly";
    if ((score ?? 0) < 2.0) return "Moderate anomaly";
    return "High anomaly - Suspicious";
  };

  const getStatusColor = (isApproved) => {
    return isApproved ? "#10B981" : "#EF4444";
  };

  // Determine approval status
  const approvalStatus = getApprovalStatus(anomaly_score);
  const scoreColor = getScoreColor(anomaly_score);
  const statusColor = getStatusColor(approvalStatus === "Approved");

  // Get fields to display based on document type
  const getDisplayFields = () => {
    if (!extracted_data) return [];
    
    switch (document_type) {
      case "Aadhaar Card":
        return [
          { label: "Full Name", value: extracted_data["Full Name"] || "N/A" },
          { label: "Gender", value: extracted_data["Gender"] || "N/A" },
          { label: "Date of Birth", value: extracted_data["Date/Year of Birth"] || "N/A" },
          { label: "Aadhaar Number", value: extracted_data["Aadhaar Number"] || "N/A" },
        ];
      case "Pan Card":
        return [
          { label: "Name", value: extracted_data["Name"] || "N/A" },
          { label: "Parent's Name", value: extracted_data["Parent's Name"] || "N/A" },
          { label: "Date of Birth", value: extracted_data["Date of Birth"] || "N/A" },
          { label: "PAN Number", value: extracted_data["PAN Number"] || "N/A" },
        ];
      case "Passport":
        return [
          { label: "Full Name", value: `${extracted_data["given_name"] || ""} ${extracted_data["surname"] || ""}`.trim() || "N/A" },
          { label: "Nationality", value: extracted_data["nationality"] || "N/A" },
          { label: "Gender", value: extracted_data["sex"] || "N/A" },
          { label: "Date of Birth", value: extracted_data["date_of_birth"] || "N/A" },
          { label: "Place of Birth", value: extracted_data["place_of_birth"] || "N/A" },
          { label: "Place of Issue", value: extracted_data["place_of_issue"] || "N/A" },
        ];
      default:
        return [];
    }
  };

  const handleManualDecision = async (decision) => {
    setSavingStatus('loading');
    setSelectedDecision(decision);

    try {
      // Safe field extraction from result — never send undefined
      const allowedTypes = ["Aadhaar Card", "Pan Card", "Passport"];
      const safeDocumentType = allowedTypes.includes(result?.document_type)
          ? result.document_type
          : null;

      if (!safeDocumentType) {
        console.error("❌ Invalid document_type:", result?.document_type, "— Skipping manual decision.");
        setSavingStatus('error');
        return;
      }

      const safeAnomalyScore = result?.anomaly_score ?? 0;
      const safeExtractedData = result?.extracted_data || result?.ocr_data || {};
      const safeSimilarRecords = result?.similar_records || [];

      // Extract user name from document
      const getDocumentName = (docType, data) => {
        if (docType === 'Pan Card')
          return data?.Name || data?.name || 'Unknown';
        if (docType === 'Aadhaar Card')
          return data?.['Full Name'] || data?.full_name || 'Unknown';
        if (docType === 'Passport')
          return `${data?.surname || ''} ${data?.given_name || ''}`.trim() || 'Unknown';
        return 'Unknown';
      };
      
      const safeUserName = getDocumentName(safeDocumentType, safeExtractedData);

      console.log('🔵 Sending manual decision:', decision);
      console.log('📦 Request body:', {
        user_name: safeUserName,
        document_type: safeDocumentType,
        anomaly_score: safeAnomalyScore,
        status: decision,
        extracted_data: safeExtractedData,
        similar_nodes: safeSimilarRecords.length
      });

      const response = await fetch(`${API_BASE}/kyc/verifications/manual-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_name: safeUserName,
          document_type: safeDocumentType,
          anomaly_score: safeAnomalyScore,
          status: decision,
          extracted_data: safeExtractedData,
          similar_nodes: safeSimilarRecords
        })
      });

      console.log('📨 Response status:', response.status);
      const responseData = await response.json();
      console.log('📨 Response body:', responseData);

      if (response.ok) {
        console.log('✅ Manual decision saved:', decision);
        setSavingStatus('success');
        
        // Navigate to history page after 2 seconds to show success message
        setTimeout(() => {
          navigate('/chat-history', { state: { refreshData: true } });
        }, 2000);
      } else {
        console.error('❌ Failed to save manual decision:', responseData.error);
        setSavingStatus('error');
      }
    } catch (error) {
      console.error('❌ Error saving manual decision:', error.message);
      console.error('Stack trace:', error);
      setSavingStatus('error');
    }
  };

  return (
    <div className="verification-result-container">
      {/* Status Circle */}
      <div className="result-header">
        <div className="status-circle" style={{ backgroundColor: statusColor }}>
          {approvalStatus === "Approved" ? "✓" : "⚠"}
        </div>
        <h2 style={{ color: statusColor }}>
          {approvalStatus === "Approved" 
            ? "Document verification APPROVED" 
            : "Document verification SUSPICIOUS - Potential fraud detected"}
        </h2>
        <p>All steps completed successfully</p>
      </div>

      {/* Main Result Card */}
      <div className="result-card">
        {/* Document Info */}
        <div className="result-section">
          <h3>Document Information</h3>
          <div className="info-grid">
            <div className="info-row">
              <span className="info-label">Document Type</span>
              <span className="info-value">{document_type}</span>
            </div>
          </div>
        </div>

        {/* Extracted Fields */}
        <div className="result-section">
          <h3>Extracted Information</h3>
          <div className="info-grid">
            {getDisplayFields().map((field, idx) => (
              <div key={idx} className="info-row">
                <span className="info-label">{field.label}</span>
                <span className="info-value">{field.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Anomaly Score */}
        <div className="result-section">
          <h3>Fraud Analysis Results</h3>
          <div className="anomaly-card" style={{ borderLeftColor: scoreColor }}>
            <div className="anomaly-header">
              <span>Anomaly Score</span>
              <span className="anomaly-score" style={{ color: scoreColor }}>
                {anomaly_score != null ? anomaly_score.toFixed(2) : "N/A"}
              </span>
            </div>
            <div className="anomaly-bar">
              <div
                className="anomaly-fill"
                style={{
                  width: `${(anomaly_score ?? 0) > 2.0 ? 100 : ((anomaly_score ?? 0) / 2.0) * 100}%`,
                  backgroundColor: scoreColor,
                }}
              />
            </div>
            <div className="anomaly-info">
              <p>{getAnomalyLabel(anomaly_score)}</p>
            </div>
          </div>
        </div>

        {/* Top 5 Similar Nodes */}
        {similar_records?.length > 0 && (
          <div className="result-section">
            <h3>Top 5 Most Similar Documents</h3>
            <div className="similar-docs-container">
              {similar_records.slice(0, 2).map((record, idx) => (
                <div key={idx} className="similar-doc-card">
                  <div className="doc-header">
                    <span className="doc-number">Document #{idx + 1}</span>
                    <span className="similarity-badge">
                      Similarity: {record?.similarity != null ? record.similarity.toFixed(4) : "N/A"}
                    </span>
                  </div>
                  <div className="doc-details">
                    {Object.entries(record).map(([key, value]) => {
                      if (key === 'similarity') return null;
                      return (
                        <div key={key} className="detail-row">
                          <span className="detail-label">{key}:</span>
                          <span className="detail-value">{String(value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Final Status */}
        <div className="result-section final-status">
          <div className="status-box" style={{ borderLeftColor: statusColor }}>
            <h4>Final Verification Status</h4>
            <p className="status-text" style={{ color: statusColor }}>
              {approvalStatus === "Approved"
                ? "✓ Document verification APPROVED"
                : "⚠ Document verification SUSPICIOUS - Potential fraud detected"}
            </p>
          </div>
        </div>

        {/* Manual Decision Buttons */}
        <div className="result-section decision-buttons-section">
          <h4>Manual Review Decision</h4>
          
          {is_non_kyc ? (
            // Non-KYC Document: Show only 1 button
            <div className="decision-buttons">
              <button
                className="btn-decision btn-non-kyc"
                onClick={() => handleManualDecision('Non-KYC')}
                disabled={savingStatus === 'loading' || selectedDecision !== null}
              >
                ✗ Mark as Non-KYC
              </button>
            </div>
          ) : (
            // Regular Documents: Show 3 buttons
            <div className="decision-buttons">
              <button
                className="btn-decision btn-approve"
                onClick={() => handleManualDecision('Approved')}
                disabled={savingStatus === 'loading' || selectedDecision !== null}
              >
                ✓ Approve
              </button>
              <button
                className="btn-decision btn-suspicious"
                onClick={() => handleManualDecision('Suspicious')}
                disabled={savingStatus === 'loading' || selectedDecision !== null}
              >
                ⚠ Suspicious
              </button>
              <button
                className="btn-decision btn-reject"
                onClick={() => handleManualDecision('Rejected')}
                disabled={savingStatus === 'loading' || selectedDecision !== null}
              >
                ✗ Reject
              </button>
            </div>
          )}

          {/* Confirmation Message */}
          {savingStatus === 'loading' && (
            <div className="confirmation-message loading">
              Saving verification...
            </div>
          )}
          {savingStatus === 'success' && (
            <div className="confirmation-message success">
              ✓ Verification saved as: {selectedDecision}
            </div>
          )}
          {savingStatus === 'error' && (
            <div className="confirmation-message error">
              ✗ Failed to save verification. Please try again.
            </div>
          )}
        </div>

        {/* Action Button */}
        <button className="btn-new-verification" onClick={onStartNew}>
          Start New Verification
        </button>
      </div>
    </div>
  );
};

export default VerificationResult;
