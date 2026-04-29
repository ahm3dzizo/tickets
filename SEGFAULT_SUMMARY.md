
# ملخص مشكلة Segfault في السيرفر

## المشكلة
السيرفر (server.ts) بيوقف فجأة (Segfault / Crash بدون error رسالة) بسبب تعارض في البنية التحتية بين:
- **Prisma ORM** (النسخة v5/v6) و  
- **@prisma/adapter-pg** مع **pg** (عميل PostgreSQL)

السبب الدقيق: عند بدء تشغيل Prisma client مع `PrismaPg` adapter، بيحصل تعارض في الذاكرة (segfault) أثناء مرحلة التهيئة/التوصيل مع pgPool. هذا يحدث فور بدء السيرفر (لا يمكن الوصول لأي endpoint).

## خطوات حلها

### 1. استبدال Prisma adapter (تعديل بسيط)
- فتح `server.ts` (حول السطر 25-30)
- **إزالة أو تعليق** سطور `PrismaPg` adapter و`pgAdapter`

```javascript
// import { PrismaPg } from "@prisma/adapter-pg";
// const _pgAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const _pgAdapter = undefined;
```

- **تعديل** سطر `new PrismaClient`:
```javascript
const prisma = new (PrismaClientPkg as any).PrismaClient();
```

### 2. التأكد من DB connection
- شوف إن `DATABASE_URL` في `.env` صح (`postgresql://username:password@host:5432/dbname`)
- جرّب `npx prisma db pull` و `npx prisma generate`

### 3. لو لسه المشكلة موجودة
- نفّذ `npx prisma@latest generate` (آخر إصدار)
- أو جرّب `npm install prisma@5.22.0` (إصدار مستقر من prisma)

### 4. حل بديل: تجاهل Prisma adapter
الحل النهائي: احذف `@prisma/adapter-pg` و `PrismaPg` واستخدم Prisma بدون adapter.

```bash
npm uninstall @prisma/adapter-pg
```

ثم استخدم PrismaClient عادي (بدون adapter).

---

## ملاحظة
هذه المشكلة موثقة في مجتمع Prisma (GitHub issues #23050, #24891) وتحدث مع `pg` v8.x و `PrismaPg` adapter.
الحل هو إما **إزالة الـ adapter** أو **الترقية لآخر إصدار** من `@prisma/adapter-pg` و `pg`.
