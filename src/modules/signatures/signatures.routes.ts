import express from "express";
import multer from "multer";
import {
    listSignatures,
    createSignature,
    deleteSignature,
} from "./signatures.controller.js";
import { protect } from "../../core/middlewares/authMiddleware.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";

// Signature images are held in memory then streamed to Drive — no disk writes.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const router = express.Router();

// Signatures are a shared, app-wide asset — any authenticated staff member can
// list/add/remove them. `protect` keeps them out of unauthenticated hands.
router.get("/", protect, listSignatures);
router.post(
    "/",
    protect,
    upload.single("file"),
    logActivity("CREATE", "Signature"),
    createSignature,
);
router.delete("/:id", protect, logActivity("DELETE", "Signature"), deleteSignature);

export default router;
