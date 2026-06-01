import os
from fastapi import FastAPI, UploadFile, File, HTTPException
import uvicorn
from pydantic import BaseModel
import tempfile
import shutil

app = FastAPI(title="Chandra OCR Service")

# Initialize Chandra model lazily
_model = None

def get_model():
    global _model
    if _model is None:
        print("Loading Chandra model...")
        from chandra.pipeline import ChandraPipeline
        _model = ChandraPipeline()
        print("Model loaded successfully.")
    return _model

@app.post("/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    try:
        model = get_model()
        
        # Save uploaded file to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
            shutil.copyfileobj(file.file, temp_pdf)
            temp_pdf_path = temp_pdf.name
            
        print(f"Processing PDF: {temp_pdf_path}")
        
        # Chandra handles pdf extraction natively
        results = model.process(temp_pdf_path)
        
        # Clean up
        os.unlink(temp_pdf_path)
        
        # Chandra returns a list of dictionaries per page or similar structure.
        # We need to format it into a generic JSON list
        return {"success": True, "results": results}
        
    except Exception as e:
        print(f"Error extracting PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8005)
