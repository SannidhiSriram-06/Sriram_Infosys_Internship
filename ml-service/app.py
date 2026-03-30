import os
import json
import re
import tempfile
import pickle
import numpy as np
import cv2
import torch
import torch.nn.functional as F
from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer
from torch_geometric.nn import GCNConv
from sklearn.preprocessing import StandardScaler
import easyocr
from groq import Groq
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
MODELS_DIR = os.path.join(PROJECT_ROOT, "trained_models")
DATA_DIR = os.path.join(PROJECT_ROOT, "extracted_data_records")

TFLITE_MODEL_PATH  = os.path.join(MODELS_DIR, "kyc_classifier.tflite")
AADHAAR_GNN_PATH   = os.path.join(MODELS_DIR, "aadhaar_gnn_model.pth")
PAN_GNN_PATH       = os.path.join(MODELS_DIR, "pan_gnn_model.pth")
PASSPORT_GNN_PATH  = os.path.join(MODELS_DIR, "passport_gnn_model.pth")

AADHAAR_DATA_PATH  = os.path.join(DATA_DIR, "aadhaar_card_data(414).json")
PAN_DATA_PATH      = os.path.join(DATA_DIR, "pan_card_data(536).json")
PASSPORT_DATA_PATH = os.path.join(DATA_DIR, "passport_data(200).json")

# Scaler and embedding database cache files
AADHAAR_SCALER_PATH = os.path.join(MODELS_DIR, "aadhaar_scaler.pkl")
AADHAAR_EMB_PATH    = os.path.join(MODELS_DIR, "aadhaar_embeddings.pt")
AADHAAR_RECORDS_PATH = os.path.join(MODELS_DIR, "aadhaar_records.pkl")

PAN_SCALER_PATH = os.path.join(MODELS_DIR, "pan_scaler.pkl")
PAN_EMB_PATH    = os.path.join(MODELS_DIR, "pan_embeddings.pt")
PAN_RECORDS_PATH = os.path.join(MODELS_DIR, "pan_records.pkl")

PASSPORT_SCALER_PATH = os.path.join(MODELS_DIR, "passport_scaler.pkl")
PASSPORT_EMB_PATH    = os.path.join(MODELS_DIR, "passport_embeddings.pt")
PASSPORT_RECORDS_PATH = os.path.join(MODELS_DIR, "passport_records.pkl")


# ---------------------------------------------------------------------------
# Load environment variables
# ---------------------------------------------------------------------------
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY not found in .env file")
groq_client = Groq(api_key=GROQ_API_KEY)

# ---------------------------------------------------------------------------
# Groq extraction prompts for each document type
# ---------------------------------------------------------------------------
GROQ_PROMPTS = {
    "Aadhaar Card": """Extract the following information from the Aadhaar card OCR text and return ONLY valid JSON:
{{"Full Name": "", "Date/Year of Birth": "", "Gender": "", "Aadhaar Number": ""}}

OCR Text:
{ocr_text}

Return ONLY the JSON object, no additional text.""",

    "Pan Card": """Extract the following information from the PAN card OCR text and return ONLY valid JSON:
{{"Name": "", "Parent's Name": "", "Date of Birth": "", "PAN Number": ""}}

OCR Text:
{ocr_text}

Return ONLY the JSON object, no additional text.""",

    "Passport": """Extract the following information from the Passport OCR text and return ONLY valid JSON:
{{"surname": "", "given_name": "", "nationality": "", "sex": "", "date_of_birth": "", "place_of_birth": "", "place_of_issue": ""}}

IMPORTANT for sex field:
- If you find M, Male, or masculine indicator → use "Male"
- If you find F, Female, or feminine indicator → use "Female"
- If not found → use empty string ""

OCR Text:
{ocr_text}

Return ONLY the JSON object, no additional text.""",
}

# ---------------------------------------------------------------------------
# Document classification class map
# ---------------------------------------------------------------------------
CLASS_MAP = {0: "Aadhaar Card", 1: "Pan Card", 2: "Passport", 3: "Non-KYC Document"}

FRAUD_THRESHOLD = 0.5

# Passport month abbreviation lookup
MONTH_ABBR = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}

# ---------------------------------------------------------------------------
# GNN model definitions
#   Aadhaar : 400-dim input  (384 name + 16 numeric)
#   Pan     : 782-dim input  (384 name + 384 parent-name + 14 numeric)
#   Passport: 1157-dim input (384 full-name + 384 pob + 384 poi + 5 numeric)
# ---------------------------------------------------------------------------
class AadhaarGNN(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = GCNConv(400, 128)
        self.conv2 = GCNConv(128, 64)

    def forward(self, x, edge_index):
        x = F.relu(self.conv1(x, edge_index))
        return self.conv2(x, edge_index)


class PanGNN(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = GCNConv(782, 128)
        self.conv2 = GCNConv(128, 64)

    def forward(self, x, edge_index):
        x = F.relu(self.conv1(x, edge_index))
        return self.conv2(x, edge_index)


class PassportGNN(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = GCNConv(1157, 128)
        self.conv2 = GCNConv(128, 64)

    def forward(self, x, edge_index):
        x = F.relu(self.conv1(x, edge_index))
        return self.conv2(x, edge_index)


# ---------------------------------------------------------------------------
# DOB / field parsing helpers
# ---------------------------------------------------------------------------
def _parse_dob_dmy(dob: str):
    """Parse 'DD/MM/YYYY', 'MM/YYYY', or 'YYYY' → (day, month, year)."""
    dob = (dob or "").strip()
    day = month = year = 0
    if "/" in dob:
        parts = dob.split("/")
        try:
            if len(parts) == 3:
                day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
            elif len(parts) == 2:
                month, year = int(parts[0]), int(parts[1])
        except ValueError:
            pass
    elif len(dob) == 4 and dob.isdigit():
        year = int(dob)
    return day, month, year


def _parse_dob_passport(dob: str):
    """Parse '10 OCT 1960' → (day, month, year)."""
    dob = (dob or "").strip().upper()
    day = month = year = 0
    parts = dob.split()
    try:
        if len(parts) == 3:
            day = int(parts[0])
            month = MONTH_ABBR.get(parts[1], 0)
            year = int(parts[2])
    except (ValueError, IndexError):
        pass
    return day, month, year


def _encode_aadhaar(number: str):
    """Return list of 12 individual digits (zeros if invalid)."""
    a = (number or "").replace(" ", "")
    if a.isdigit() and len(a) == 12:
        return [int(d) for d in a]
    return [0] * 12


def _encode_pan(pan: str):
    """Encode 10-char PAN: alpha → 1-26, digit → 0-9; pad/truncate to 10."""
    pan = (pan or "").upper().replace(" ", "")
    encoded = []
    for c in pan[:10]:
        if c.isalpha():
            encoded.append(ord(c) - 64)   # A=1 … Z=26
        elif c.isdigit():
            encoded.append(int(c))
        else:
            encoded.append(0)
    encoded += [0] * (10 - len(encoded))
    return encoded


# ---------------------------------------------------------------------------
# Feature-matrix builders (used at startup to fit StandardScaler)
# ---------------------------------------------------------------------------
def _build_aadhaar_matrix(records, sent_model):
    """(N, 400): 384 name-embedding + [gender, day, month, year, 12 digits]."""
    names = [r.get("Full Name") or "" for r in records]
    name_emb = sent_model.encode(names, batch_size=64, show_progress_bar=False)  # (N,384)
    numerics = []
    gender_map = {"Male": 1, "Female": 0, "Other": 2}
    for r in records:
        g = gender_map.get(r.get("Gender"), 0)
        d, mo, y = _parse_dob_dmy(r.get("Date/Year of Birth", ""))
        digits = _encode_aadhaar(r.get("Aadhaar Number", ""))
        numerics.append([g, d, mo, y] + digits)
    return np.concatenate([name_emb, np.array(numerics)], axis=1).astype(np.float32)


def _build_pan_matrix(records, sent_model):
    """(N, 782): 384 name + 384 parent-name + [0, day, month, year, 10 pan-chars]."""
    names   = [r.get("Name") or "" for r in records]
    parents = [r.get("Parent's Name") or "" for r in records]
    name_emb   = sent_model.encode(names,   batch_size=64, show_progress_bar=False)
    parent_emb = sent_model.encode(parents, batch_size=64, show_progress_bar=False)
    numerics = []
    for r in records:
        d, mo, y = _parse_dob_dmy(r.get("Date of Birth", ""))
        pan_enc = _encode_pan(r.get("PAN Number", ""))
        numerics.append([0, d, mo, y] + pan_enc)   # gender=0 (not on card)
    return np.concatenate([name_emb, parent_emb, np.array(numerics)], axis=1).astype(np.float32)


def _build_passport_matrix(records, sent_model):
    """(N, 1157): 384 full-name + 384 pob + 384 poi + [sex, nationality, day, month, year]."""
    full_names = [
        f"{r.get('given_name', '')} {r.get('surname', '')}".strip()
        for r in records
    ]
    pobs = [r.get("place_of_birth") or "" for r in records]
    pois = [r.get("place_of_issue") or "" for r in records]
    name_emb = sent_model.encode(full_names, batch_size=64, show_progress_bar=False)
    pob_emb  = sent_model.encode(pobs,       batch_size=64, show_progress_bar=False)
    poi_emb  = sent_model.encode(pois,       batch_size=64, show_progress_bar=False)
    numerics = []
    for r in records:
        sex  = 1 if (r.get("sex") or "").upper() == "M" else 0
        nat  = 1 if (r.get("nationality") or "").upper() == "INDIAN" else 0
        d, mo, y = _parse_dob_passport(r.get("date_of_birth", ""))
        numerics.append([sex, nat, d, mo, y])
    return np.concatenate([name_emb, pob_emb, poi_emb, np.array(numerics)], axis=1).astype(np.float32)


# ---------------------------------------------------------------------------
# GNN embedding builder (used at startup for similarity index)
# ---------------------------------------------------------------------------
def _gnn_embeddings(features_scaled: np.ndarray, model: torch.nn.Module) -> torch.Tensor:
    """Run all records through GNN (empty edge_index), return L2-normalised (N,64)."""
    x = torch.tensor(features_scaled, dtype=torch.float)
    empty_ei = torch.empty((2, 0), dtype=torch.long)
    with torch.no_grad():
        emb = model(x, empty_ei)
    norms = emb.norm(dim=1, keepdim=True).clamp(min=1e-8)
    return emb / norms


# ---------------------------------------------------------------------------
# OCR output normalisation
# ---------------------------------------------------------------------------
def _ocr_aadhaar(raw: dict) -> dict:
    return {
        "Full Name":           raw.get("Full Name")           or raw.get("name")           or "",
        "Date/Year of Birth":  raw.get("Date/Year of Birth")  or raw.get("dob")            or "",
        "Gender":              raw.get("Gender")              or raw.get("gender")          or "",
        "Aadhaar Number":      raw.get("Aadhaar Number")      or raw.get("aadhaar_number")  or "",
    }


def _ocr_pan(raw: dict) -> dict:
    return {
        "Name":          raw.get("Name")           or raw.get("name")         or "",
        "Parent's Name": raw.get("Parent's Name")  or raw.get("father_name")  or "",
        "Date of Birth": raw.get("Date of Birth")  or raw.get("dob")          or "",
        "PAN Number":    raw.get("PAN Number")     or raw.get("pan_number")   or "",
    }


def _ocr_passport(raw: dict) -> dict:
    """Map openbharatocr passport output to the JSON-schema fields used by GNN."""
    full_name = raw.get("name") or ""
    # Split "GIVEN SURNAME" into parts if possible; treat whole string as given_name
    parts = full_name.strip().split()
    surname    = parts[-1] if parts else ""
    given_name = " ".join(parts[:-1]) if len(parts) > 1 else full_name
    return {
        "surname":        surname,
        "given_name":     given_name,
        "nationality":    raw.get("nationality") or "INDIAN",
        "sex":            raw.get("sex") or "",
        "date_of_birth":  raw.get("dob") or "",
        "place_of_birth": raw.get("place_of_birth") or "",
        "place_of_issue": raw.get("place_of_issue") or "",
        # surface fields for API response
        "Full Name":      full_name,
        "Date of Birth":  raw.get("dob") or "",
        "Passport Number": raw.get("passport_number") or "",
    }


# ---------------------------------------------------------------------------
# Single-record feature extractors (for inference)
# ---------------------------------------------------------------------------
def _features_aadhaar(ocr: dict) -> np.ndarray:
    name_vec = sentence_model.encode([ocr.get("Full Name") or ""])[0]
    gender_map = {"Male": 1, "Female": 0, "Other": 2}
    g = gender_map.get(ocr.get("Gender"), 0)
    d, mo, y = _parse_dob_dmy(ocr.get("Date/Year of Birth", ""))
    digits = _encode_aadhaar(ocr.get("Aadhaar Number", ""))
    num = np.array([g, d, mo, y] + digits, dtype=np.float32)
    return np.concatenate([name_vec, num]).reshape(1, -1)


def _features_pan(ocr: dict) -> np.ndarray:
    name_vec   = sentence_model.encode([ocr.get("Name") or ""])[0]
    parent_vec = sentence_model.encode([ocr.get("Parent's Name") or ""])[0]
    d, mo, y = _parse_dob_dmy(ocr.get("Date of Birth", ""))
    pan_enc = _encode_pan(ocr.get("PAN Number", ""))
    num = np.array([0, d, mo, y] + pan_enc, dtype=np.float32)
    return np.concatenate([name_vec, parent_vec, num]).reshape(1, -1)


def _features_passport(ocr: dict) -> np.ndarray:
    full_name = f"{ocr.get('given_name', '')} {ocr.get('surname', '')}".strip()
    name_vec = sentence_model.encode([full_name])[0]
    pob_vec  = sentence_model.encode([ocr.get("place_of_birth") or ""])[0]
    poi_vec  = sentence_model.encode([ocr.get("place_of_issue") or ""])[0]
    sex = 1 if (ocr.get("sex") or "").upper() == "M" else 0
    nat = 1 if (ocr.get("nationality") or "").upper() == "INDIAN" else 0
    d, mo, y = _parse_dob_passport(ocr.get("date_of_birth", ""))
    num = np.array([sex, nat, d, mo, y], dtype=np.float32)
    return np.concatenate([name_vec, pob_vec, poi_vec, num]).reshape(1, -1)


# ---------------------------------------------------------------------------
# Fraud detection: scale → GNN → anomaly score + top-5 similarity
# ---------------------------------------------------------------------------
def _run_gnn(features_raw: np.ndarray, scaler: StandardScaler,
             gnn: torch.nn.Module, db_emb: torch.Tensor,
             db_records: list, label_fn, doc_type: str = "Unknown") -> dict:
    """
    features_raw : (1, D) unscaled feature vector
    db_emb       : (N, 64) L2-normalised embeddings of training records
    label_fn     : callable(record) → display dict for similar_records
    doc_type     : document type for logging
    """
    print(f"[GNN] Running GNN for {doc_type}")
    print(f"[GNN] Number of records in database: {len(db_records)}")
    print(f"[GNN] Database embeddings shape: {db_emb.shape}")
    
    scaled = scaler.transform(features_raw).astype(np.float32)
    x = torch.tensor(scaled, dtype=torch.float)
    empty_ei = torch.empty((2, 0), dtype=torch.long)

    with torch.no_grad():
        emb = gnn(x, empty_ei)                               # (1, 64)
        anomaly_score = float(torch.norm(emb, dim=1).item())

    print(f"[GNN] Anomaly score: {anomaly_score:.6f}")
    print(f"[GNN] Embedding shape: {emb.shape}")

    # Cosine similarity against all training embeddings
    norm = emb.norm(dim=1, keepdim=True).clamp(min=1e-8)
    emb_norm = emb / norm                                     # (1, 64)
    sims = torch.mm(emb_norm, db_emb.T).squeeze(0)           # (N,)
    top5_idx = sims.topk(min(5, len(db_records))).indices.tolist()

    print(f"[GNN] Top 5 similarity scores: {[sims[idx].item() for idx in top5_idx]}")

    similar = []
    for idx in top5_idx:
        rec = label_fn(db_records[idx])
        rec["similarity"] = round(float(sims[idx].item()), 4)
        similar.append(rec)

    status = "Suspicious" if anomaly_score >= FRAUD_THRESHOLD else "Approved"
    return {
        "anomaly_score": round(anomaly_score, 6),
        "threshold": FRAUD_THRESHOLD,
        "status": status,
        "similar_records": similar,
    }


# ---------------------------------------------------------------------------
# Label helpers for similar-record display
# ---------------------------------------------------------------------------
def _label_aadhaar(r):
    return {
        "Full Name": r.get("Full Name", ""), 
        "Gender": r.get("Gender", ""),
        "Date/Year of Birth": r.get("Date/Year of Birth", ""),
        "Aadhaar Number": r.get("Aadhaar Number", "")[:4] + "****" + r.get("Aadhaar Number", "")[-4:] if len(r.get("Aadhaar Number", "")) >= 8 else "N/A"
    }

def _label_pan(r):
    return {
        "Name": r.get("Name", ""), 
        "Parent's Name": r.get("Parent's Name", ""),
        "PAN Number": r.get("PAN Number", "")[:2] + "****" + r.get("PAN Number", "")[-4:] if len(r.get("PAN Number", "")) >= 6 else "N/A",
        "Date of Birth": r.get("Date of Birth", "")
    }

def _label_passport(r):
    return {
        "Name": f"{r.get('given_name','')} {r.get('surname','')}".strip(),
        "Date of Birth": r.get("date_of_birth", ""),
        "Nationality": r.get("nationality", ""),
        "Gender": r.get("sex", ""),
        "Place of Birth": r.get("place_of_birth", ""),
        "Place of Issue": r.get("place_of_issue", "")
    }


# ===========================================================================
# STARTUP: load everything once
# ===========================================================================

print("[ML-Service] Loading TFLite document classifier...")
import tensorflow as tf
tflite_interpreter = tf.lite.Interpreter(model_path=TFLITE_MODEL_PATH)
tflite_interpreter.allocate_tensors()
tflite_input_details  = tflite_interpreter.get_input_details()
tflite_output_details = tflite_interpreter.get_output_details()

print("[ML-Service] Loading SentenceTransformer (all-MiniLM-L6-v2)...")
sentence_model = SentenceTransformer("all-MiniLM-L6-v2")

# Helper function to load or create cache
def load_or_build_cache(doc_type, data_path, scaler_path, emb_path, records_path, 
                       gnn_model_path, gnn_class, build_matrix_fn):
    """Load from cache if available, otherwise build from data and save."""
    if os.path.exists(scaler_path) and os.path.exists(emb_path) and os.path.exists(records_path):
        print(f"[ML-Service] Loading cached {doc_type} scaler and embeddings...")
        with open(scaler_path, 'rb') as f:
            scaler = pickle.load(f)
        db_emb = torch.load(emb_path, map_location="cpu")
        with open(records_path, 'rb') as f:
            records = pickle.load(f)
        
        # Verify document type separation
        print(f"[ML-Service] ✓ Loaded {doc_type} cache:")
        print(f"  - Total records: {len(records)}")
        print(f"  - Embeddings shape: {db_emb.shape}")
        print(f"  - Scaler features: {scaler.n_features_in_}")
        
        return scaler, db_emb, records
    
    print(f"[ML-Service] Building {doc_type} feature matrix and fitting StandardScaler...")
    with open(data_path, encoding="utf-8") as f:
        records = json.load(f)
    
    print(f"[ML-Service] {doc_type} records loaded: {len(records)} documents")
    
    features_raw = build_matrix_fn(records, sentence_model)
    scaler = StandardScaler()
    features_scaled = scaler.fit_transform(features_raw)
    
    print(f"[ML-Service] Loading {doc_type} GNN model from: {gnn_model_path}")
    gnn = gnn_class()
    gnn.load_state_dict(torch.load(gnn_model_path, map_location="cpu"))
    gnn.eval()
    
    print(f"[ML-Service] Building {doc_type} GNN embedding index...")
    db_emb = _gnn_embeddings(features_scaled, gnn)
    
    print(f"[ML-Service] ✓ Built {doc_type} cache:")
    print(f"  - Total records: {len(records)}")
    print(f"  - Embeddings shape: {db_emb.shape}")
    print(f"  - Scaler features: {scaler.n_features_in_}")
    
    # Save to cache
    print(f"[ML-Service] Saving {doc_type} cache files...")
    with open(scaler_path, 'wb') as f:
        pickle.dump(scaler, f)
    torch.save(db_emb, emb_path)
    with open(records_path, 'wb') as f:
        pickle.dump(records, f)
    
    return scaler, db_emb, records

# --- Aadhaar ---
aadhaar_scaler, aadhaar_db_emb, aadhaar_records = load_or_build_cache(
    "Aadhaar", AADHAAR_DATA_PATH, AADHAAR_SCALER_PATH, AADHAAR_EMB_PATH, 
    AADHAAR_RECORDS_PATH, AADHAAR_GNN_PATH, AadhaarGNN, _build_aadhaar_matrix
)
aadhaar_gnn = AadhaarGNN()
aadhaar_gnn.load_state_dict(torch.load(AADHAAR_GNN_PATH, map_location="cpu"))
aadhaar_gnn.eval()

# --- Pan Card ---
pan_scaler, pan_db_emb, pan_records = load_or_build_cache(
    "Pan Card", PAN_DATA_PATH, PAN_SCALER_PATH, PAN_EMB_PATH, 
    PAN_RECORDS_PATH, PAN_GNN_PATH, PanGNN, _build_pan_matrix
)
pan_gnn = PanGNN()
pan_gnn.load_state_dict(torch.load(PAN_GNN_PATH, map_location="cpu"))
pan_gnn.eval()

# --- Passport ---
passport_scaler, passport_db_emb, passport_records = load_or_build_cache(
    "Passport", PASSPORT_DATA_PATH, PASSPORT_SCALER_PATH, PASSPORT_EMB_PATH, 
    PASSPORT_RECORDS_PATH, PASSPORT_GNN_PATH, PassportGNN, _build_passport_matrix
)
passport_gnn = PassportGNN()
passport_gnn.load_state_dict(torch.load(PASSPORT_GNN_PATH, map_location="cpu"))
passport_gnn.eval()

print("[ML-Service] All models and data loaded successfully.")

# Initialize EasyOCR reader (downloads models on first run)
print("[ML-Service] Initializing EasyOCR reader...")
easyocr_reader = easyocr.Reader(['en'], gpu=False)

# ---------------------------------------------------------------------------
# EasyOCR + Groq extraction functions
# ---------------------------------------------------------------------------
def extract_text_easyocr(image_path: str) -> str:
    """Extract text from image using EasyOCR."""
    try:
        results = easyocr_reader.readtext(image_path)
        text = "\n".join([result[1] for result in results])
        return text
    except Exception as e:
        raise ValueError(f"EasyOCR extraction failed: {str(e)}")


def extract_with_groq(raw_text: str, doc_type: str) -> dict:
    """Send OCR text to Groq for structured extraction."""
    if doc_type not in GROQ_PROMPTS:
        raise ValueError(f"Unsupported document type: {doc_type}")
    
    prompt = GROQ_PROMPTS[doc_type].format(ocr_text=raw_text)
    
    try:
        # Groq 0.4.2 API uses chat.completions.create
        message = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )
        response_text = message.choices[0].message.content.strip()
        
        # Parse JSON response
        extracted_data = json.loads(response_text)
        return extracted_data
    except json.JSONDecodeError as e:
        raise ValueError(f"Groq response is not valid JSON: {response_text}")
    except Exception as e:
        raise ValueError(f"Groq API error: {str(e)}")


def detect_document_type_auto(raw_text: str) -> str:
    """Auto-detect document type from OCR text keywords."""
    text_lower = raw_text.lower()
    
    aadhaar_keywords = ["aadhaar", "uid", "enrollment"]
    pan_keywords = ["pan", "income tax", "permanent account"]
    passport_keywords = ["passport", "passport number", "surname", "given name"]
    
    aadhaar_score = sum(1 for kw in aadhaar_keywords if kw in text_lower)
    pan_score = sum(1 for kw in pan_keywords if kw in text_lower)
    passport_score = sum(1 for kw in passport_keywords if kw in text_lower)
    
    scores = {
        "Aadhaar Card": aadhaar_score,
        "Pan Card": pan_score,
        "Passport": passport_score
    }
    
    detected = max(scores, key=scores.get)
    if scores[detected] == 0:
        return None
    return detected


# ---------------------------------------------------------------------------
# Helper: classify document image with TFLite
# ---------------------------------------------------------------------------
def classify_document(image_path: str):
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")
    img_rgb    = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_input  = (cv2.resize(img_rgb, (128, 128)) / 255.0).reshape(1, 128, 128, 3).astype(np.float32)

    tflite_interpreter.set_tensor(tflite_input_details[0]["index"], img_input)
    tflite_interpreter.invoke()
    prediction = tflite_interpreter.get_tensor(tflite_output_details[0]["index"])[0]

    predicted_class = int(np.argmax(prediction))
    confidence      = float(np.max(prediction) * 100)
    document_type   = CLASS_MAP.get(predicted_class, "Unknown")
    class_scores    = {CLASS_MAP[i]: round(float(prediction[i]) * 100, 2) for i in range(4)}
    return document_type, confidence, class_scores


# ===========================================================================
# Flask app
# ===========================================================================
app = Flask(__name__)
CORS(app)

# Global variable to store temp file path for multi-step requests
temp_image_cache = {}


# ===========================================================================
# NEW ENDPOINTS: Modular 5-step pipeline
# ===========================================================================

@app.route("/api/ml/detect-document-type", methods=["POST"])
def detect_document_type():
    """Step 1: Detect document type from image."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Empty filename"}), 400
    
    suffix = os.path.splitext(file.filename)[1] or ".jpg"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        file.save(tmp.name)
        tmp.close()
        
        # Store in cache for subsequent steps
        request_id = os.path.basename(tmp.name)
        temp_image_cache[request_id] = tmp.name
        
        # Classify document
        document_type, confidence, class_scores = classify_document(tmp.name)
        
        return jsonify({
            "success": True,
            "request_id": request_id,
            "document_type": document_type,
            "confidence": round(confidence, 2),
            "class_scores": class_scores
        }), 200
    
    except Exception as e:
        return jsonify({"error": f"Detection failed: {str(e)}"}), 500
    finally:
        # Don't delete - keep for next steps
        pass


@app.route("/api/ml/extract-text", methods=["POST"])
def extract_text():
    """Step 2: Extract OCR text from document."""
    request_id = request.json.get("request_id")
    document_type = request.json.get("document_type")
    
    if not request_id or request_id not in temp_image_cache:
        return jsonify({"error": "Invalid request_id. Call detect-document-type first."}), 400
    
    image_path = temp_image_cache[request_id]
    
    try:
        raw_text = extract_text_easyocr(image_path)
        
        return jsonify({
            "success": True,
            "request_id": request_id,
            "document_type": document_type,
            "raw_ocr_text": raw_text,
            "text_length": len(raw_text)
        }), 200
    
    except Exception as e:
        return jsonify({"error": f"OCR extraction failed: {str(e)}"}), 500


@app.route("/api/ml/parse-document", methods=["POST"])
def parse_document():
    """Step 3: Parse OCR text into structured JSON using Groq."""
    request_id = request.json.get("request_id")
    document_type = request.json.get("document_type")
    raw_ocr_text = request.json.get("raw_ocr_text")
    
    if not document_type or not raw_ocr_text:
        return jsonify({"error": "Missing document_type or raw_ocr_text"}), 400
    
    try:
        extracted_data = extract_with_groq(raw_ocr_text, document_type)
        
        # Post-process: Ensure Passport gender is formatted as Male/Female
        if document_type == "Passport" and "sex" in extracted_data:
            sex = str(extracted_data.get("sex", "")).strip().upper()
            if sex in ["M", "MALE"]:
                extracted_data["sex"] = "Male"
            elif sex in ["F", "FEMALE"]:
                extracted_data["sex"] = "Female"
            print(f"[Parse] Passport sex field processed: '{sex}' → '{extracted_data['sex']}'")
        
        return jsonify({
            "success": True,
            "request_id": request_id,
            "document_type": document_type,
            "extracted_data": extracted_data
        }), 200
    
    except ValueError as ve:
        return jsonify({"error": f"Parsing error: {str(ve)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Groq API error: {str(e)}"}), 500


@app.route("/api/ml/fraud-analysis", methods=["POST"])
def fraud_analysis():
    """Step 4: Run GNN fraud detection and return anomaly score + top 5 nodes."""
    request_id = request.json.get("request_id")
    document_type = request.json.get("document_type")
    extracted_data = request.json.get("extracted_data")
    
    if not document_type or not extracted_data:
        return jsonify({"error": "Missing document_type or extracted_data"}), 400
    
    try:
        print(f"\n[GNN Analysis] Processing document type: {document_type}")
        
        # Extract features based on document type
        if document_type == "Aadhaar Card":
            print(f"[GNN Analysis] Using Aadhaar GNN model")
            print(f"[GNN Analysis] Model path: {AADHAAR_GNN_PATH}")
            feats = _features_aadhaar(extracted_data)
            fraud = _run_gnn(feats, aadhaar_scaler, aadhaar_gnn,
                           aadhaar_db_emb, aadhaar_records, _label_aadhaar, "Aadhaar Card")
        
        elif document_type == "Pan Card":
            print(f"[GNN Analysis] Using Pan Card GNN model")
            print(f"[GNN Analysis] Model path: {PAN_GNN_PATH}")
            feats = _features_pan(extracted_data)
            fraud = _run_gnn(feats, pan_scaler, pan_gnn,
                           pan_db_emb, pan_records, _label_pan, "Pan Card")
        
        elif document_type == "Passport":
            print(f"[GNN Analysis] Using Passport GNN model")
            print(f"[GNN Analysis] Model path: {PASSPORT_GNN_PATH}")
            feats = _features_passport(extracted_data)
            fraud = _run_gnn(feats, passport_scaler, passport_gnn,
                           passport_db_emb, passport_records, _label_passport, "Passport")
        
        else:
            return jsonify({"error": f"Unsupported document type: {document_type}"}), 400
        
        # Clean up temp image
        if request_id in temp_image_cache:
            try:
                os.unlink(temp_image_cache[request_id])
                del temp_image_cache[request_id]
            except:
                pass
        
        return jsonify({
            "success": True,
            "request_id": request_id,
            "document_type": document_type,
            "anomaly_score": fraud.get("anomaly_score"),
            "threshold": fraud.get("threshold"),
            "status": fraud.get("status"),
            "similar_records": fraud.get("similar_records")
        }), 200
    
    except Exception as e:
        return jsonify({"error": f"GNN analysis failed: {str(e)}"}), 500


# ===========================================================================
# LEGACY ENDPOINT: Full pipeline (kept for backward compatibility)
# ===========================================================================

@app.route("/api/ml/classify", methods=["POST"])
def classify():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Empty filename"}), 400

    suffix = os.path.splitext(file.filename)[1] or ".jpg"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        file.save(tmp.name)
        tmp.close()

        # ── Step 1: TFLite document classification ────────────────────────────
        document_type, confidence, class_scores = classify_document(tmp.name)
        print(f"[ML] TFLite classification: {document_type} ({confidence:.1f}%)")

        # ── Step 2: ALWAYS run OCR first (before any branching) ───────────
        raw_text = ""
        try:
            raw_text = extract_text_easyocr(tmp.name)
        except Exception as ocr_extract_err:
            print(f"[OCR] EasyOCR extraction failed: {ocr_extract_err}")
            raw_text = ""

        print(f"[OCR TEXT SAMPLE]: {raw_text[:200] if raw_text else 'EMPTY'}")

        # ── Step 2b: Weak-OCR fallback ────────────────────────────────────
        if not raw_text or len(raw_text.strip()) < 5:
            print("[HEURISTIC] OCR weak or empty → forcing PAN fallback")
            document_type = "Pan Card"

        # ── Step 3: Heuristic fallback if classification is Non-KYC or empty ─
        # FIXED PIPELINE: Never trust Non-KYC blindly — check OCR text first
        if not document_type or document_type == "Non-KYC Document":
            text_upper = (raw_text or "").upper()
            # PAN regex detection (highest priority)
            pan_match = re.search(r"[A-Z]{5}[0-9]{4}[A-Z]", raw_text or "")
            if pan_match:
                document_type = "Pan Card"
                print(f"[ML] Heuristic override: PAN number detected ({pan_match.group()}) → Pan Card")
            elif "INCOME TAX DEPARTMENT" in text_upper or "PERMANENT ACCOUNT" in text_upper:
                document_type = "Pan Card"
                print("[ML] Heuristic override: Income Tax keywords → Pan Card")
            elif "AADHAAR" in text_upper or "UNIQUE IDENTIFICATION" in text_upper:
                document_type = "Aadhaar Card"
                print("[ML] Heuristic override: Aadhaar keywords → Aadhaar Card")
            elif "PASSPORT" in text_upper or "REPUBLIC OF INDIA" in text_upper:
                document_type = "Passport"
                print("[ML] Heuristic override: Passport keywords → Passport")
            # Do NOT return early — let combined fallback below handle it

        # ── Step 3b: Combined fallback for remaining Non-KYC cases ────────
        if document_type == "Non-KYC Document":
            if re.search(r'[A-Z]{5}[0-9]{4}[A-Z]', raw_text or ""):
                print("[HEURISTIC] PAN regex detected")
                document_type = "Pan Card"
            elif not raw_text or len(raw_text.strip()) < 5:
                print("[FORCE FIX] OCR empty → assuming PAN")
                document_type = "Pan Card"

        result = {
            "document_type": document_type,
            "confidence":    round(confidence, 2),
            "class_scores":  class_scores,
            "ocr_data":      None,
            "fraud_detection": None,
        }

        # ── Step 4: OCR parsing + GNN (only for valid KYC documents) ──────
        if document_type in ("Aadhaar Card", "Pan Card", "Passport"):
            try:
                # Parse extracted text with Groq
                ocr = extract_with_groq(raw_text or "", document_type)

                # Process through GNN fraud detection
                if document_type == "Aadhaar Card":
                    feats   = _features_aadhaar(ocr)
                    fraud   = _run_gnn(feats, aadhaar_scaler, aadhaar_gnn,
                                       aadhaar_db_emb, aadhaar_records, _label_aadhaar)
                    result["ocr_data"]         = ocr
                    result["fraud_detection"]   = fraud
                    result["anomaly_score"]     = fraud.get("anomaly_score")
                    result["similar_records"]   = fraud.get("similar_records")

                elif document_type == "Pan Card":
                    print("=== PAN OCR DATA ===")
                    print(ocr)
                    feats = _features_pan(ocr)
                    fraud = _run_gnn(feats, pan_scaler, pan_gnn,
                                     pan_db_emb, pan_records, _label_pan)
                    result["ocr_data"]         = ocr
                    result["fraud_detection"]   = fraud
                    result["anomaly_score"]     = fraud.get("anomaly_score")
                    result["similar_records"]   = fraud.get("similar_records")

                elif document_type == "Passport":
                    feats = _features_passport(ocr)
                    fraud = _run_gnn(feats, passport_scaler, passport_gnn,
                                     passport_db_emb, passport_records, _label_passport)
                    result["ocr_data"]         = ocr
                    result["fraud_detection"]   = fraud
                    result["anomaly_score"]     = fraud.get("anomaly_score")
                    result["similar_records"]   = fraud.get("similar_records")

            except Exception as ocr_err:
                print(f"[ML] OCR/GNN error: {ocr_err}")
                result["ocr_data"]       = {"raw_text": raw_text or ""}
                result["fraud_detection"] = {"error": "OCR/Groq processing failed"}

        # ── Step 5: Ensure safe response — never return None/missing fields ─
        if not result.get("document_type"):
            result["document_type"] = "Unknown"
        if not result.get("ocr_data") or result.get("ocr_data") is None:
            result["ocr_data"] = {"raw_text": raw_text or ""} if raw_text else {}
        if result.get("anomaly_score") is None:
            result["anomaly_score"] = 0
        if result.get("similar_records") is None:
            result["similar_records"] = []

        # ── Step 6: Debug logging ─────────────────────────────────────────
        print(f"[OCR TEXT SAMPLE]: {raw_text[:200] if raw_text else 'EMPTY'}")
        print(f"[FINAL DOCUMENT TYPE]: {result['document_type']}")
        print(f"[ML] Extracted data keys: {list(result['ocr_data'].keys()) if isinstance(result['ocr_data'], dict) else 'N/A'}")
        print(f"[ML] Anomaly score: {result.get('anomaly_score')}")

        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)


@app.route("/api/ml/extract-document", methods=["POST"])
def extract_document():
    """Extract structured data from document using EasyOCR + Groq."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Empty filename"}), 400
    
    doc_type = request.form.get("doc_type", None)
    
    suffix = os.path.splitext(file.filename)[1] or ".jpg"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        file.save(tmp.name)
        tmp.close()
        
        # Detect document type if not provided
        if not doc_type:
            document_type, confidence, _ = classify_document(tmp.name)
            if document_type == "Non-KYC Document":
                return jsonify({"error": "Not a valid KYC document"}), 400
            doc_type = document_type
        
        # Extract text and parse with Groq
        raw_text = extract_text_easyocr(tmp.name)
        extracted_data = extract_with_groq(raw_text, doc_type)
        
        return jsonify({
            "document_type": doc_type,
            "extracted_data": extracted_data,
            "raw_ocr_text": raw_text
        }), 200
    
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": f"Extraction failed: {str(e)}"}), 500
    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)


@app.route("/api/ml/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "models_loaded": True}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
