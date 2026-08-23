/**
 * seed-subtypes.ts
 * ─────────────────
 * يتأكد إن sub-types أساسية موجودة في الـ DB.
 * آمن للتشغيل عدة مرات (idempotent) — بيتجاهل اللي موجود بالفعل.
 */

import prisma from "../db.js";

interface SubTypeSeed {
  parentKey: string;
  nameAr: string;
  keywords: string[];   // كلمات ترتبط بهذا الـ sub-type
}

const REQUIRED_SUBTYPES: SubTypeSeed[] = [
  {
    parentKey: 'drainage',
    nameAr: 'روائح كريهة',
    keywords: ['رائحه', 'رائحة', 'روائح', 'نتانه', 'نتانة', 'كريهه', 'كريهة'],
  },
  {
    parentKey: 'drainage',
    nameAr: 'انسداد مصرف',
    keywords: ['انسداد', 'مسدود', 'معطل'],
  },
];

export async function seedSubTypes(): Promise<void> {
  try {
    for (const item of REQUIRED_SUBTYPES) {
      const parentType = await prisma.ticketType.findUnique({
        where: { key: item.parentKey },
        select: { id: true },
      });
      if (!parentType) continue;

      // Create sub-type if missing
      let subType = await prisma.ticketSubType.findFirst({
        where: { parentTypeId: parentType.id, nameAr: item.nameAr },
        select: { id: true },
      });

      if (!subType) {
        subType = await prisma.ticketSubType.create({
          data: {
            nameAr:       item.nameAr,
            parentTypeId: parentType.id,
            isActive:     true,
          },
          select: { id: true },
        });
        console.log(`✅ [seed] Created sub-type "${item.nameAr}" under ${item.parentKey}`);
      }

      // Link keywords → sub-type (only update unlinked ones, don't overwrite explicit assignments)
      for (const kw of item.keywords) {
        const existing = await prisma.ticketTypeKeyword.findFirst({
          where: { keyword: kw, typeId: parentType.id },
        });

        if (existing) {
          if (!existing.subTypeId) {
            await prisma.ticketTypeKeyword.update({
              where: { id: existing.id },
              data:  { subTypeId: subType.id },
            });
          }
        } else {
          await prisma.ticketTypeKeyword.create({
            data: {
              keyword:    kw,
              typeId:     parentType.id,
              subTypeId:  subType.id,
              weight:     2.0,
              source:     'seed',
              isLearned:  false,
              usageCount: 0,
            },
          });
        }
      }
    }
  } catch (err: any) {
    console.error('[seed-subtypes] error:', err.message);
  }
}
