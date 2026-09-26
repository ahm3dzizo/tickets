import { Router, type Request, type Response } from "express";
import fs from "fs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { resolveMediaFile } from "../media-library.js";

const router = Router();

const bridgeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "CLAUDE_RATE_LIMITED" },
});

const gatewayBase = (
  process.env.CLAUDE_GATEWAY_URL || "http://127.0.0.1:8082"
).replace(/\/+$/, "");

const model =
  process.env.CLAUDE_MEDIA_MODEL?.trim() ||
  "anthropic/nvidia_nim/meta/llama-3.2-90b-vision-instruct";
const uiKey = process.env.CLAUDE_MEDIA_UI_KEY?.trim() || "";
const gatewayAuthToken = (
  process.env.CLAUDE_GATEWAY_AUTH_TOKEN ||
  process.env.ANTHROPIC_AUTH_TOKEN ||
  ""
).trim();

const supportedVisionTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hasBridgeAccess(req: Request) {
  if (!uiKey) return false;
  const supplied = req.get("x-media-claude-key")?.trim() || "";
  return safeEqual(supplied, uiKey);
}

function readTextBlocks(payload: any) {
  if (!payload || !Array.isArray(payload.content)) return "";
  return payload.content
    .filter((block: any) => block?.type === "text" && typeof block.text === "string")
    .map((block: any) => block.text)
    .join("\n\n")
    .trim();
}

router.get("/status", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    enabled: Boolean(uiKey && model && gatewayAuthToken),
    gateway: "local",
    modelConfigured: Boolean(model),
    accessKeyConfigured: Boolean(uiKey),
    gatewayAuthConfigured: Boolean(gatewayAuthToken),
    model: model || null,
  });
});

router.post("/analyze", bridgeLimiter, async (req: Request, res: Response) => {
  if (!uiKey || !model || !gatewayAuthToken) {
    return res.status(503).json({
      error: "CLAUDE_BRIDGE_NOT_CONFIGURED",
      message: "ربط Claude غير مفعّل على السيرفر بعد.",
    });
  }

  if (!hasBridgeAccess(req)) {
    return res.status(401).json({
      error: "CLAUDE_BRIDGE_KEY_REQUIRED",
      message: "مفتاح Claude الخاص بواجهة الصور غير صحيح.",
    });
  }

  const relativePath =
    typeof req.body?.path === "string" ? req.body.path.trim() : "";
  const instruction =
    typeof req.body?.instruction === "string"
      ? req.body.instruction.trim().slice(0, 800)
      : "";

  try {
    const resolved = await resolveMediaFile(relativePath);
    if (!resolved.ok) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    if (!supportedVisionTypes.has(resolved.mimeType)) {
      return res.status(415).json({
        error: "CLAUDE_VISION_TYPE_UNSUPPORTED",
        message: "هذا النوع لا يمكن إرساله إلى Claude Vision حالياً.",
      });
    }

    if (resolved.size > 10 * 1024 * 1024) {
      return res.status(413).json({
        error: "CLAUDE_IMAGE_TOO_LARGE",
        message: "حجم الصورة أكبر من الحد المسموح للتحليل.",
      });
    }

    const image = await fs.promises.readFile(resolved.realTarget);
    const prompt = [
      "You are the visual product-classification engine for Hedaya, a handmade gifts and accessories brand.",
      "Analyze ONLY what is visibly supported by this source image. Do not invent hidden product details.",
      "Return STRICT JSON only, without markdown fences, commentary, or prose outside the JSON object.",
      "Use this exact schema:",
      '{"kind":"product|logo|banner|reference|other","productNameEn":"string","productNameAr":"string","category":"string","variantName":"string","productSignature":"stable lowercase signature","confidence":0.0,"tags":["string"],"visualSummary":"string","qualityNotes":"string","remasterNotes":"string"}',
      "Classification rules:",
      "- productSignature must describe the exact visible design identity, not merely a broad category.",
      "- Different photos of the same exact product/design should aim for the same productSignature.",
      "- Products that look similar but differ in shape, decoration, colorway, material arrangement, lettering, motif, or construction MUST receive different productSignature values.",
      "- Never merge distinct variants just because they belong to the same category.",
      "- confidence must be a number from 0 to 1.",
      "- Keep names concise and suitable for an ecommerce catalog.",
      "- tags should contain 3 to 8 useful lowercase English tags.",
      "- qualityNotes should identify visible image issues such as lighting, crop, blur, background, perspective, or resolution.",
      "- remasterNotes should describe what can safely be improved while preserving the exact product identity.",
      instruction ? "Additional operator instruction: " + instruction : "",
    ].filter(Boolean).join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      };

      headers.authorization = `Bearer ${gatewayAuthToken}`;

      const response = await fetch(`${gatewayBase}/v1/messages`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_tokens: 1600,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: resolved.mimeType,
                    data: image.toString("base64"),
                  },
                },
                {
                  type: "text",
                  text: prompt,
                },
              ],
            },
          ],
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        console.error("[media-claude] Gateway error", {
          status: response.status,
          error: payload?.error?.type || payload?.error || "unknown",
        });

        return res.status(502).json({
          error: "CLAUDE_GATEWAY_FAILED",
          message: "Claude gateway لم يقبل الطلب.",
          gatewayStatus: response.status,
        });
      }

      const text = readTextBlocks(payload);
      if (!text) {
        return res.status(502).json({
          error: "CLAUDE_EMPTY_RESPONSE",
          message: "Claude لم يرجع تحليلاً نصياً.",
        });
      }

      return res.json({
        path: resolved.relativePath,
        model,
        analysis: text,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    const isAbort = error?.name === "AbortError";
    console.error("[media-claude] Analysis failed:", isAbort ? "timeout" : error);

    return res.status(isAbort ? 504 : 500).json({
      error: isAbort ? "CLAUDE_GATEWAY_TIMEOUT" : "CLAUDE_ANALYSIS_FAILED",
      message: isAbort
        ? "انتهت مهلة انتظار Claude."
        : "تعذر تحليل الصورة بواسطة Claude.",
    });
  }
});

export default router;
