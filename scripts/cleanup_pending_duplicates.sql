-- Remove pending users that duplicate real users by employeeId or phoneNumber.
DELETE FROM "User" p
USING "User" r
WHERE p.uid LIKE 'pending_%'
  AND r.uid NOT LIKE 'pending_%'
  AND (
    (p."employeeId" IS NOT NULL AND p."employeeId" = r."employeeId")
    OR
    (p."phoneNumber" IS NOT NULL AND p."phoneNumber" = r."phoneNumber")
  );

-- Keep only one pending user per employeeId (latest updatedAt), delete older duplicates.
DELETE FROM "User" u
USING (
  SELECT uid,
         ROW_NUMBER() OVER (PARTITION BY "employeeId" ORDER BY "updatedAt" DESC) AS rn
  FROM "User"
  WHERE uid LIKE 'pending_%' AND "employeeId" IS NOT NULL
) d
WHERE u.uid = d.uid AND d.rn > 1;

-- Keep only one pending user per phoneNumber (latest updatedAt), delete older duplicates.
DELETE FROM "User" u
USING (
  SELECT uid,
         ROW_NUMBER() OVER (PARTITION BY "phoneNumber" ORDER BY "updatedAt" DESC) AS rn
  FROM "User"
  WHERE uid LIKE 'pending_%' AND "phoneNumber" IS NOT NULL
) d
WHERE u.uid = d.uid AND d.rn > 1;
