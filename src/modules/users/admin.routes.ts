import express from "express";
import multer from "multer";
import { getAllUsers, getUserById, createUser, updateUser, deleteUser, deleteMultipleUsers, uploadUserImage } from "./users.controller.js";
import { adminMiddleware, protect } from "../../core/middlewares/authMiddleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { logActivity } from "../../core/middlewares/activityLog.middleware.js";
import { BulkDeleteSchema } from "../../core/types/common.types.js";
import { CreateUserSchema, UpdateUserSchema } from "./users.types.js";

const router = express.Router();

// Profile images are held in memory then streamed to Drive — no disk writes.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

router.use(protect, adminMiddleware);

// Upload a profile image to Drive; returns the URL to store on User.picture.
// Declared before "/users/:id" so "upload-image" isn't read as a user id.
router.post(
    "/users/upload-image",
    upload.single("file"),
    logActivity("UPLOAD_IMAGE", "User"),
    uploadUserImage,
);

router.route("/users")
    .get(getAllUsers)
    .post(validateRequest(CreateUserSchema as any), logActivity("CREATE", "User"), createUser);

router.delete("/users/many", validateRequest(BulkDeleteSchema as any), logActivity("DELETE", "User"), deleteMultipleUsers);

router.route("/users/:id")
    .get(getUserById)
    .patch(validateRequest(UpdateUserSchema as any), logActivity("UPDATE", "User"), updateUser)
    .delete(logActivity("DELETE", "User"), deleteUser);

export default router;
