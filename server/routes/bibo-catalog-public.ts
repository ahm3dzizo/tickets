import { Router } from "express";
const router = Router();
router.post("/products", async (req, res) => {
  res.json({ name: String(req.body?.name || "") });
});
export default router;
