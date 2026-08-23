import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { requireTechAuth, TechAuthRequest } from './tech-auth.js';
import { verifyAppToken, verifyFirebaseToken } from '../auth.js';
import { APP_JWT_SECRET } from '../config.js';
import prisma from '../db.js';

const router = Router();

async function allowEitherAuth(req: any, res: any, next: any) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = header.slice(7);
  
  try {
    const payload = jwt.verify(token, APP_JWT_SECRET) as any;
    if (payload.role === 'technician' && payload.technicianId) {
      req.technicianId = payload.technicianId;
      next();
      return;
    }
  } catch (e) {
  }

  try {
    const appPayload = verifyAppToken(token);
    req.uid = appPayload.uid;
    req.tokenEmail = appPayload.email;
    next();
    return;
  } catch {}

  try {
    const payload = await verifyFirebaseToken(token);
    req.uid = payload.sub;
    req.tokenEmail = payload.email;
    req.tokenName = payload.name;
    next();
    return;
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

router.post('/translate', allowEitherAuth, async (req: any, res: any) => {
  try {
    const { texts, targetLang, context } = req.body;
    if (!Array.isArray(texts) || texts.length === 0 || !['en', 'hi', 'ur'].includes(targetLang)) {
      res.status(400).json({ error: 'Invalid input' });
      return;
    }
    
    const result: Record<string, string> = {};
    const uncachedTexts: string[] = [];
    
    for (const text of texts) {
      const cached = await prisma.translationCache.findUnique({
        where: {
          sourceText_targetLang: { sourceText: text, targetLang }
        }
      });
      if (cached) {
        result[text] = cached.translated;
        await prisma.translationCache.update({
          where: { id: cached.id },
          data: {
            usageCount: { increment: 1 },
            lastUsedAt: new Date()
          }
        });
      } else {
        uncachedTexts.push(text);
      }
    }
    
    if (uncachedTexts.length > 0) {
      const prompt = `Translate these Arabic maintenance terms/sentences to ${targetLang}. Return ONLY a valid JSON array of translated strings in the same order. No explanations.\n${JSON.stringify(uncachedTexts)}`;
      
      const response = await fetch('https://router.bynara.id/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NARA_API_KEY}`
        },
        body: JSON.stringify({
          model: 'mistral-large',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to translate');
      }
      
      const data = await response.json();
      const content = data.choices[0].message.content;
      
      let translatedArr: string[] = [];
      try {
        const match = content.match(/\[.*\]/s);
        if (match) {
          translatedArr = JSON.parse(match[0]);
        } else {
          translatedArr = JSON.parse(content);
        }
      } catch (e) {
        throw new Error('Failed to parse translation response');
      }
      
      for (let i = 0; i < uncachedTexts.length; i++) {
        const text = uncachedTexts[i];
        const translated = translatedArr[i];
        if (translated) {
          result[text] = translated;
          await prisma.translationCache.upsert({
            where: {
              sourceText_targetLang: { sourceText: text, targetLang }
            },
            update: {
              translated,
              usageCount: { increment: 1 },
              lastUsedAt: new Date()
            },
            create: {
              sourceText: text,
              targetLang,
              translated
            }
          });
        }
      }
    }
    
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
