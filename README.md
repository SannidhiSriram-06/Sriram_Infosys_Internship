## 📌 Overview

This system verifies identity documents such as:

- 🪪 Aadhaar Card  
- 🪪 PAN Card  
- 🛂 Passport  
- 📄 Non-KYC Documents (rejected)

It performs:

1. Document Type Detection (ML model)
2. OCR Text Extraction (EasyOCR)
3. Data Parsing & Structuring
4. Fraud Detection using Graph Neural Networks (GNN)
5. Final Verification Decision (Approved / Suspicious / Rejected)

---

## 🏗️ System Architecture


User → Frontend (React) → Backend (Node.js)
→ ML Service (Flask)
→ Database (MongoDB Atlas)
→ Response → UI


---

## ⚙️ Tech Stack

### Frontend
- React (Vite)
- Axios
- Tailwind CSS

### Backend
- Node.js (Express)
- MongoDB (Atlas)
- JWT Authentication

### ML Service
- Python (Flask)
- EasyOCR
- TensorFlow / PyTorch
- Graph Neural Networks (GNN)

### Deployment
- AWS EC2 (Backend + ML Service)
- AWS S3 (Frontend Hosting)
- PM2 (Process Management)

---

## 🔥 Key Features

- ✅ Multi-document classification (Aadhaar, PAN, Passport)
- ✅ OCR-based data extraction
- ✅ GNN-based fraud detection using similarity graphs
- ✅ Real-time verification dashboard
- ✅ Manual review system (Approve / Reject / Suspicious)
- ✅ Fault-tolerant backend with safe fallbacks
- ✅ Cloud deployment on AWS

---

## 🧠 ML Pipeline

1. Image Upload  
2. Document Classification  
3. OCR Extraction  
4. Data Preprocessing  
5. Feature Vector Creation  
6. Graph Construction  
7. GNN Anomaly Detection  
8. Final Decision  

---

## 📊 Sample Output

- Document Type: PAN Card  
- Extracted Fields: Name, DOB, PAN Number  
- Anomaly Score: 2.08  
- Status: Suspicious  

---

## 🚀 Setup Instructions

### 1. Clone Repo
```bash
git clone https://github.com/SannidhiSriram-06/Sriram_Infosys_Internship.git
cd Sriram_Infosys_Internship
2. Backend Setup
cd backend
npm install
npm start
3. ML Service Setup
cd ml-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
4. Frontend Setup
cd frontend
npm install
npm run dev
☁️ Deployment
Frontend → AWS S3 Static Hosting
Backend → EC2 (Node.js + PM2)
ML Service → EC2 (Flask + PM2)
Database → MongoDB Atlas
📌 API Endpoints
Backend
POST /api/auth/login
POST /api/kyc/verify
GET /api/kyc/verifications
GET /api/kyc/verifications/stats
ML Service
POST /api/ml/classify
🛡️ Fraud Detection Logic
Graph-based similarity between documents
Node = Document
Edge = Feature similarity
High anomaly score → Suspicious
👨‍💻 Contributors
Sriram Sannidhi — Deployment, Backend, Integration
Team Members — ML Models, Dataset, Research
📈 Future Improvements
Face Matching Integration
Real-time KYC APIs
More document types
Better OCR accuracy with custom models
🧾 License

This project is for academic and demonstration purposes.

🙌 Acknowledgements
Roboflow (Dataset)
EasyOCR
MongoDB Atlas
AWS

⭐ If you found this useful, give it a star!


---

# ⚡ WHAT YOU DO NOW

```bash
touch README.md

Paste → Save → then:

git add README.md
git commit -m "Added README"
git push
