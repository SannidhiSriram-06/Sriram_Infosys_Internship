import torch

models = {
    "aadhaar": r"E:\project work\AI-Powered-Identity-Verification-and-Fraud-Detection-for-KYC-Compliance\Trained models\aadhaar_gnn_model.pth",
    "pan": r"E:\project work\AI-Powered-Identity-Verification-and-Fraud-Detection-for-KYC-Compliance\Trained models\pan_gnn_model.pth",
    "passport": r"E:\project work\AI-Powered-Identity-Verification-and-Fraud-Detection-for-KYC-Compliance\Trained models\passport_gnn_model.pth",
}

for name, path in models.items():
    print(f"\n=== {name} ===")
    sd = torch.load(path, map_location="cpu")
    for k, v in sd.items():
        print(f"  {k}: {v.shape}")
