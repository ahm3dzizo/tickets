import { Router } from "express";
import { requireAuth } from "../auth.js";
import multer from "multer";
import FormData from "form-data";
import fs from "fs";

const router = Router();
const upload = multer({ dest: "uploads/" }); // temporary storage

router.post("/extract-pdf", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const formData = new FormData();
    formData.append("file", fs.createReadStream(req.file.path), {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    // Call the local Python OCR service
    const ocrUrl = process.env.NODE_ENV === 'production'
      ? 'http://127.0.0.1:8005/extract-pdf'
      : 'http://84.8.120.31:8005/extract-pdf';
    const fetchResponse = await fetch(ocrUrl, {
      method: "POST",
      body: formData as any,
      headers: formData.getHeaders(),
    });

    if (!fetchResponse.ok) {
      const err = await fetchResponse.text();
      throw new Error(`OCR service failed: ${err}`);
    }

    const data = await fetchResponse.json();
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json(data);
  } catch (error: any) {
    console.error("Error calling OCR service:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: "Failed to extract text from PDF via OCR" });
  }
});

export default router;
