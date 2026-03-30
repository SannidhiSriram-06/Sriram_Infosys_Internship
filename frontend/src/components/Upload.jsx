import React, { useState, useRef, useEffect } from "react";
import DashboardLayout from "./DashboardLayout";
import { verifyDocument } from "../services/api";
import VerificationResult from "./VerificationResult";
import NonKYCResult from "./NonKYCResult";

const Upload = () => {

  const [mainFile, setMainFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const [aiStatus, setAiStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [verificationResult, setVerificationResult] = useState(null);
  const [verificationError, setVerificationError] = useState(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState(0);
  const [currentStepUI, setCurrentStepUI] = useState(0);

  const [supportingFiles, setSupportingFiles] = useState([]);
  const supportingInputRef = useRef(null);

  const STEPS = [
    "Document Type Detection",
    "OCR Text Extraction",
    "Data Parsing",
    "GNN Fraud Analysis",
    "Final Verification",
  ];

  useEffect(() => {
    if (aiStatus === "scanning") {
      let currentProgress = 0;

      const interval = setInterval(() => {
        currentProgress += 1.2;
        if (currentProgress >= 90) {
          clearInterval(interval);
          currentProgress = 90;
        }
        setProgress(Math.floor(currentProgress));

        if (currentProgress > 15) setCurrentStep(1);
        if (currentProgress > 35) setCurrentStep(2);
        if (currentProgress > 55) setCurrentStep(3);
        if (currentProgress > 75) setCurrentStep(4);
      }, 100);

      return () => clearInterval(interval);
    } else if (aiStatus === "idle") {
      setProgress(0);
      setCurrentStep(0);
    }
  }, [aiStatus]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setMainFile(e.dataTransfer.files[0]);
      setAiStatus("idle");
      e.dataTransfer.clearData();
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setMainFile(e.target.files[0]);
      setAiStatus("idle");
    }
  };

  const handleSupportingChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setSupportingFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeSupportingFile = (index) => {
    setSupportingFiles(supportingFiles.filter((_, i) => i !== index));
  };

  const handleRemoveFile = (e) => {
    if (e) e.stopPropagation();
    setMainFile(null);
    setSupportingFiles([]);
    setAiStatus("idle");
    setVerificationResult(null);
    setVerificationError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (supportingInputRef.current) supportingInputRef.current.value = "";
  };

  const startFakeProgress = () => {
    setVerifyProgress(0);
    setCurrentStepUI(0);
    const interval = setInterval(() => {
      setVerifyProgress((prev) => {
        let next = prev + 5;
        if (next >= 90) next = 90;
        
        if (next >= 80) setCurrentStepUI(4);
        else if (next >= 60) setCurrentStepUI(3);
        else if (next >= 40) setCurrentStepUI(2);
        else if (next >= 20) setCurrentStepUI(1);
        
        return next;
      });
    }, 300);
    return interval;
  };

  // ✅ FIXED FUNCTION (NO ML CALLS HERE)
  const handleStartVerification = async () => {
    if (!mainFile) return;

    setVerificationResult(null);
    setVerificationError(null);
    setAiStatus("scanning");
    setIsProcessing(true);

    const progressInterval = startFakeProgress();

    try {
      setCurrentStep(1);
      setProgress(30);

      const result = await verifyDocument(mainFile, supportingFiles);

      clearInterval(progressInterval);
      setVerifyProgress(100);
      setCurrentStepUI(5);

      setTimeout(() => {
        setIsProcessing(false);
        setCurrentStep(4);
        setProgress(100);

        setVerificationResult({
          is_non_kyc: false,
          ...result,
        });

        setAiStatus("completed");
      }, 400);

    } catch (err) {
      clearInterval(progressInterval);
      setIsProcessing(false);
      setCurrentStep(4);
      setProgress(100);
      setVerificationError(
        err.message || "Could not reach server. Please try again."
      );
      setAiStatus("completed");
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <DashboardLayout>
      <div className="page-header">
        <h1>New KYC Verification</h1>
        <p>Upload identity documents for AI-powered verification</p>
      </div>

      <div className="kyc-layout-container">

        <div className="kyc-left-panel">

          {!mainFile && (
            <div className="dash-card upload-card-full">
              <div className="card-label">
                <span>Identity Document <span style={{ color: "var(--danger)" }}>*</span></span>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".jpg,.jpeg,.png,.pdf"
                style={{ display: "none" }}
                disabled={aiStatus !== 'idle'}
              />

              <div
                className="drop-zone"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current.click()}
              >
                <div style={{ fontSize: "28px", marginBottom: "12px" }}>
                  📄
                </div>
                <div style={{ fontSize: "14px", fontWeight: "500" }}>
                  Click or drag file to upload
                </div>
                <div style={{ fontSize: "13px" }}>
                  PNG, JPG or PDF • Max 5MB
                </div>
              </div>
            </div>
          )}

          {mainFile && (
            <>
              <div className="dash-card">
                <div className="file-chip">
                  <div>{mainFile.name}</div>
                  {aiStatus === 'idle' && (
                    <button onClick={handleRemoveFile}>Remove</button>
                  )}
                </div>
              </div>

              {aiStatus === 'idle' && (
                <button onClick={handleStartVerification}>
                  Start AI Verification
                </button>
              )}

              {isProcessing && (
                <div style={{ marginTop: '20px', marginBottom: '20px', padding: '15px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ marginBottom: '15px', fontSize: '16px', fontWeight: '600', margin: '0 0 15px 0' }}>Verification Progress</h3>
                  
                  <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {STEPS.map((step, index) => (
                      <div key={index} style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                        <span style={{ 
                          marginRight: '10px', 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          width: '20px', 
                          height: '20px',
                          fontWeight: 'bold',
                          color: index < currentStepUI ? '#10b981' : index === currentStepUI ? '#3b82f6' : '#9ca3af'
                        }}>
                          {index < currentStepUI ? '✔' : index === currentStepUI ? '●' : '○'}
                        </span>
                        <span style={{ 
                          color: index <= currentStepUI ? '#111827' : '#6b7280',
                          fontWeight: index === currentStepUI ? '500' : '400'
                        }}>
                          {step}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                    Processing... {verifyProgress}%
                  </div>
                  <div style={{ width: '100%', backgroundColor: '#e5e7eb', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${verifyProgress}%`, backgroundColor: '#3b82f6', height: '100%', transition: 'width 0.3s ease' }}></div>
                  </div>
                </div>
              )}

              {aiStatus === 'completed' && verificationError && (
                <div>{verificationError}</div>
              )}

              {aiStatus === 'completed' && !verificationError && (
                <>
                  {verificationResult?.is_non_kyc ? (
                    <NonKYCResult />
                  ) : (
                    <VerificationResult result={verificationResult} />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Upload;