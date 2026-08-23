import { Router } from "express";
import { requireAuth } from "../auth.js";
import multer from "multer";
import FormData from "form-data";
import fs from "fs";
import http from "http";
import https from "https";

const router = Router();
const upload = multer({ dest: "uploads/" }); // temporary storage

/** Send a form-data stream to the Python OCR service using Node's http(s) module,
 *  which correctly handles the stream as a proper piped request body.
 */
function proxyFormData(
  ocrUrl: string,
  formData: FormData
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(ocrUrl);
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers: formData.getHeaders(),
    };

    const req = transport.request(options, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 500, body }));
    });

    req.on("error", reject);
    formData.pipe(req);
  });
}

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
    const ocrUrl =
      process.env.NODE_ENV === "production"
        ? "http://127.0.0.1:8005/extract-pdf"
        : "http://84.8.120.31:8005/extract-pdf";

    const { status, body } = await proxyFormData(ocrUrl, formData);

    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    if (status < 200 || status >= 300) {
      throw new Error(`OCR service failed (${status}): ${body}`);
    }

    const data = JSON.parse(body);
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
