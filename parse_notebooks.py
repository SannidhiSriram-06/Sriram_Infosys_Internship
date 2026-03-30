#!/usr/bin/env python3
"""
Script to parse and display all cells from Jupyter notebooks
"""

import json
import os
from pathlib import Path

notebooks = [
    r"E:\project work\AI-Powered-Identity-Verification-and-Fraud-Detection-for-KYC-Compliance\Notebooks\GNN Notebooks\Aadhaar_GNN_model.ipynb",
    r"E:\project work\AI-Powered-Identity-Verification-and-Fraud-Detection-for-KYC-Compliance\Notebooks\GNN Notebooks\Pan_Card_GNN_model.ipynb",
    r"E:\project work\AI-Powered-Identity-Verification-and-Fraud-Detection-for-KYC-Compliance\Notebooks\GNN Notebooks\passport_GNN_model.ipynb",
    r"E:\project work\AI-Powered-Identity-Verification-and-Fraud-Detection-for-KYC-Compliance\Notebooks\Detection Notebooks\Document_Detection.ipynb",
]

for notebook_path in notebooks:
    print("\n" + "="*100)
    print(f"NOTEBOOK: {notebook_path}")
    print("="*100 + "\n")
    
    if not os.path.exists(notebook_path):
        print(f"ERROR: File not found - {notebook_path}\n")
        continue
    
    try:
        with open(notebook_path, 'r', encoding='utf-8') as f:
            notebook = json.load(f)
        
        cells = notebook.get('cells', [])
        print(f"Total cells: {len(cells)}\n")
        
        for cell_idx, cell in enumerate(cells):
            cell_type = cell.get('cell_type', 'unknown')
            source = cell.get('source', [])
            
            # Handle source - can be list or string
            if isinstance(source, list):
                source_text = ''.join(source)
            else:
                source_text = source
            
            print(f"\n{'─'*100}")
            print(f"CELL INDEX: {cell_idx}")
            print(f"CELL TYPE: {cell_type}")
            print(f"{'─'*100}")
            print(source_text)
            if not source_text.endswith('\n'):
                print()
    
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse JSON - {e}\n")
    except Exception as e:
        print(f"ERROR: {e}\n")

print("\n" + "="*100)
print("ALL NOTEBOOKS PROCESSED")
print("="*100)
