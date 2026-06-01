-- ══════════════════════════════════════════════════════════════════════════
--  Sub-type keywords
--  Strategy:
--   - ON CONFLICT (keyword, typeId) → UPDATE subTypeId (link existing keyword to sub-type)
--   - New keywords that don't exist → INSERT with both typeId + subTypeId
-- ══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
--  Helper: link existing keywords to their sub-types
-- ────────────────────────────────────────────────────────────────────────────

-- PLUMBING → تسريبات مياه
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'plumbing' AND s."nameAr" = 'تسريبات مياه'
WHERE k."typeId" = t.id
  AND k.keyword IN ('تسريب','تسرب','تهريب','تهرب','تسربات','تهريبات','نز','رشح');

-- PLUMBING → انسداد مجاري
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'plumbing' AND s."nameAr" = 'انسداد مجاري'
WHERE k."typeId" = t.id
  AND k.keyword IN ('انسداد','انسدت','مسدود','مجاري','مجري','مجرى');

-- PLUMBING → خزانات  (خزان / عوامه موجودين بالفعل)
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'plumbing' AND s."nameAr" = 'خزانات'
WHERE k."typeId" = t.id
  AND k.keyword IN ('خزان','خزانات','عوامه','تعبئه');

-- PLUMBING → إصلاح خزان مياه
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'plumbing' AND s."nameAr" = 'إصلاح خزان مياه'
WHERE k."typeId" = t.id
  AND k.keyword IN ('رقبه خزان','رقبة خزان','غطاء خزان','غطا خزان');

-- PLUMBING → مضخات
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'plumbing' AND s."nameAr" = 'مضخات'
WHERE k."typeId" = t.id
  AND k.keyword IN ('مضخه','مضخة','مضخات','ضغط ماء','ضغط المياه');

-- PLUMBING → صرف صحي
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'plumbing' AND s."nameAr" = 'صرف صحي'
WHERE k."typeId" = t.id
  AND k.keyword IN ('صرف','صفاية','صفايه','مرحاض','كرسي حمام','شطاف','شطافات','ماسورة صرف');

-- ELECTRICITY → إضاءة
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'electricity' AND s."nameAr" = 'إضاءة'
WHERE k."typeId" = t.id
  AND k.keyword IN ('لمبه','لمبات','اناره','انارة','اضاءه','اضاءة');

-- ELECTRICITY → تمديدات
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'electricity' AND s."nameAr" = 'تمديدات'
WHERE k."typeId" = t.id
  AND k.keyword IN ('كابل','سلك');

-- ELECTRICITY → قواطع وفيوزات
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'electricity' AND s."nameAr" = 'قواطع وفيوزات'
WHERE k."typeId" = t.id
  AND k.keyword IN ('قاطع','قواطع','لوحة كهرباء','لوحه كهرباء','التماس');

-- ELECTRICITY → كاميرات وإنتركوم
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'electricity' AND s."nameAr" = 'كاميرات وإنتركوم'
WHERE k."typeId" = t.id
  AND k.keyword IN ('كاميرا','كاميرات');

-- DOORS_WINDOWS → أبواب ألمنيوم
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'doors_windows' AND s."nameAr" = 'أبواب ألمنيوم'
WHERE k."typeId" = t.id
  AND k.keyword IN ('المنيوم','الومنيوم','الومينيوم');

-- DOORS_WINDOWS → شبابيك
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'doors_windows' AND s."nameAr" = 'شبابيك'
WHERE k."typeId" = t.id
  AND k.keyword IN ('شباك','شبابيك','زجاج');

-- DOORS_WINDOWS → أقفال
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'doors_windows' AND s."nameAr" = 'أقفال'
WHERE k."typeId" = t.id
  AND k.keyword IN ('قفل','أقفال');

-- DOORS_WINDOWS → مقابض وأيدي أبواب/شبابيك
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'doors_windows' AND s."nameAr" = 'مقابض وأيدي أبواب/شبابيك'
WHERE k."typeId" = t.id
  AND k.keyword IN ('مقبض','مقابض');

-- DOORS_WINDOWS → جهاز باب الكراج
UPDATE "TicketTypeKeyword" k
SET "subTypeId" = s.id, "updatedAt" = NOW()
FROM "TicketSubType" s
JOIN "TicketType" t ON t.id = s."parentTypeId" AND t.key = 'doors_windows' AND s."nameAr" = 'جهاز باب الكراج'
WHERE k."typeId" = t.id
  AND k.keyword IN ('كراج','جاراج','جراج');

-- ════════════════════════════════════════════════════════════════════════
--  INSERT new keywords that don't exist yet (sub-type specific phrases)
--  These are NEW rows with both typeId + subTypeId
-- ════════════════════════════════════════════════════════════════════════

-- PLUMBING → تسريبات مياه (phrases not in DB yet)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'تسريبات مياه'
CROSS JOIN (VALUES
  ('تسريب مياه',4.5),('تهريب مياه',4.5),('نزول مياه',4.0),('رشح مياه',4.0),
  ('نزة مياه',4.0),('مياه تنز',4.0),('ماء يقطر',3.5),('يقطر',2.5)
) AS kw(word, w)
WHERE t.key = 'plumbing'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- PLUMBING → انسداد مجاري (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'انسداد مجاري'
CROSS JOIN (VALUES
  ('انسداد مجاري',4.5),('صرف مسدود',4.5),('سيفون مسدود',4.5),('صرف راجع',4.5),
  ('مجرى مسدود',4.5),('سدت الصفاية',4.0),('تسكر',3.0)
) AS kw(word, w)
WHERE t.key = 'plumbing'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- PLUMBING → إصلاح خزان مياه (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'إصلاح خزان مياه'
CROSS JOIN (VALUES
  ('إصلاح خزان',4.5),('صيانة خزان',4.5),('كسر خزان',4.5),('فتحة خزان',4.0),
  ('شق في الخزان',4.5),('خزان مكسور',4.5)
) AS kw(word, w)
WHERE t.key = 'plumbing'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- PLUMBING → خزانات (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'خزانات'
CROSS JOIN (VALUES
  ('تعبئة خزان',4.5),('الخزان فاضي',4.5),('خزان فارغ',4.5),('ملأ الخزان',4.0),
  ('خزان مايتعبا',4.5),('مستوى الخزان',3.5),('عوامة الخزان',4.0)
) AS kw(word, w)
WHERE t.key = 'plumbing'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- PLUMBING → مضخات (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'مضخات'
CROSS JOIN (VALUES
  ('مضخة ماء',4.5),('محرك المضخة',4.5),('بوستر',4.0),('ضغط منخفض',3.5),
  ('ماء ضعيف',3.5),('المياه ضعيفه',3.5),('ضعف الضغط',3.5)
) AS kw(word, w)
WHERE t.key = 'plumbing'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- ELECTRICITY → إضاءة (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'إضاءة'
CROSS JOIN (VALUES
  ('لمبة مش شغاله',4.5),('سبوت لايت',4.0),('داون لايت',4.0),('فلورسنت',3.5),
  ('الأضواء',2.5),('الأنوار',2.5),('مصباح',3.0),('نور مش شغال',4.0)
) AS kw(word, w)
WHERE t.key = 'electricity'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- ELECTRICITY → تمديدات (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'تمديدات'
CROSS JOIN (VALUES
  ('تمديد كهرباء',4.5),('تمديدات كهرباء',4.5),('نقطة كهرباء',4.0),('توصيل كهرباء',4.0),
  ('كهرباء مش واصله',4.5),('انقطاع كهرباء',3.5),('سلك كهرباء',4.0),('كابلات',3.0)
) AS kw(word, w)
WHERE t.key = 'electricity'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- ELECTRICITY → قواطع وفيوزات (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'قواطع وفيوزات'
CROSS JOIN (VALUES
  ('فيوز',4.0),('فيوزات',4.0),('القاطع يقطع',4.5),('القاطع يوقع',4.5),('يوقع القاطع',4.5),
  ('لوحة التوزيع',4.5),('شورت',3.5),('حماية الكهرباء',3.5)
) AS kw(word, w)
WHERE t.key = 'electricity'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- ELECTRICITY → كاميرات وإنتركوم (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'كاميرات وإنتركوم'
CROSS JOIN (VALUES
  ('انتركم',4.5),('انتركوم',4.5),('انتر كم',4.5),('انتر كوم',4.5),
  ('جرس الباب',3.5),('شاشة الباب',4.0),('مراقبة',3.0),
  ('كاميرا مش شغاله',4.5),('كاميرا تالفه',4.5)
) AS kw(word, w)
WHERE t.key = 'electricity'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- DOORS_WINDOWS → أبواب ألمنيوم (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'أبواب ألمنيوم'
CROSS JOIN (VALUES
  ('باب المنيوم',4.5),('باب الومنيوم',4.5),('باب حديد',3.0),('باب البراندة',3.5),
  ('باب التراس',3.5),('باب الخارجي',3.0),('باب مطبخ',3.0)
) AS kw(word, w)
WHERE t.key = 'doors_windows'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- DOORS_WINDOWS → أبواب خشب (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'أبواب خشب'
CROSS JOIN (VALUES
  ('باب خشب',4.5),('هجاس',4.0),('هجاسة',4.0),('باب الغرفة',3.5),
  ('باب الحمام',3.5),('باب داخلي',3.5),('الباب خشب',4.5),('باب ملامين',3.5),
  ('انتفاخ الباب',3.5),('الباب منتفخ',3.5)
) AS kw(word, w)
WHERE t.key = 'doors_windows'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- DOORS_WINDOWS → شبابيك (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'شبابيك'
CROSS JOIN (VALUES
  ('زجاج مكسور',4.5),('فلنشة',3.5),('فلنشه',3.5),('شباك مش بيقفل',4.5),
  ('الشباك خربان',4.5),('نافذة مكسورة',4.5),('الشباك يطرق',3.5)
) AS kw(word, w)
WHERE t.key = 'doors_windows'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- DOORS_WINDOWS → أقفال (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'أقفال'
CROSS JOIN (VALUES
  ('قفل باب',4.5),('بلطو',4.0),('بالطو',4.0),('خربوش',3.5),
  ('لسان القفل',4.5),('الباب ما يقفل',4.5),('الباب مش بيقفل',4.5),('تقفيل',3.5)
) AS kw(word, w)
WHERE t.key = 'doors_windows'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- DOORS_WINDOWS → مقابض وأيدي أبواب/شبابيك (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'مقابض وأيدي أبواب/شبابيك'
CROSS JOIN (VALUES
  ('يد باب',4.5),('يدة باب',4.5),('هاندل',4.0),('المقبض تالف',4.5),
  ('المقبض خربان',4.5),('مقبض الشباك',4.5),('مقبض الباب',4.5),('ايدي الباب',4.0)
) AS kw(word, w)
WHERE t.key = 'doors_windows'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();

-- DOORS_WINDOWS → جهاز باب الكراج (phrases)
INSERT INTO "TicketTypeKeyword" (id, keyword, "typeId", "subTypeId", weight, "isLearned", "usageCount", confidence, source, "createdAt", "updatedAt")
SELECT gen_random_uuid(), kw.word, t.id, s.id, kw.w, false, 0, 0.97, 'manual', NOW(), NOW()
FROM "TicketType" t
JOIN "TicketSubType" s ON s."parentTypeId" = t.id AND s."nameAr" = 'جهاز باب الكراج'
CROSS JOIN (VALUES
  ('ريموت الكراج',4.5),('موتور الكراج',4.5),('باب الكراج',4.5),('بوابة الكراج',4.5),
  ('الكراج مش بيفتح',4.5),('الكراج خربان',4.5),('جهاز الكراج',4.5),('ريموت',2.5)
) AS kw(word, w)
WHERE t.key = 'doors_windows'
ON CONFLICT (keyword, "subTypeId") DO UPDATE SET weight = EXCLUDED.weight, "updatedAt" = NOW();
