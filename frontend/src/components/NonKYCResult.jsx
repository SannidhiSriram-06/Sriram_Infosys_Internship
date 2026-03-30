import React from "react";
import "./VerificationResult.css";

const NonKYCResult = () => {
  return (
    <div className="result-card">
      <div className="result-header" style={{ borderBottomColor: "#EF4444" }}>
        <h2>Non-KYC Document Detected</h2>
      </div>

      <div className="result-body">
        <div className="result-section">
          <div className="non-kyc-alert">
            <div className="alert-icon">
              <span>⚠</span>
            </div>
            <div className="alert-content">
              <h3>Invalid Document Type</h3>
              <p>
                This document is not a valid KYC document. 
              </p>
              <p style={{ marginTop: "0.5rem" }}>
                <strong>Accepted documents:</strong> PAN Card, Aadhaar Card, or Passport
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NonKYCResult;
