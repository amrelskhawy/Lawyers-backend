import express from "express";
import {
    registerUser,
    loginUser,
    logoutUser,
    userLoginStatus,
    verifyEmail,
    verifyUser,
    forgotPassword,
    resetPassword,
    changePassword,
} from "./auth.controller.js";
import { getMe, updateUser } from "../users/users.controller.js";
import { protect, clearSession } from "../../core/middlewares/authMiddleware.js";
import { validateRequest } from "../../core/middlewares/validateRequest.js";
import { UserSchema, LoginSchema } from "./auth.types.js";

const router = express.Router();

// Session Management
router.post("/register", validateRequest(UserSchema), registerUser);
router.post("/login", clearSession, validateRequest(LoginSchema), loginUser);
router.get("/logout", logoutUser);
router.get("/login-status", userLoginStatus);

// Verification
router.post("/verify-email", protect, verifyEmail);
router.post("/verify-user/:verificationToken", verifyUser);

// Password Management
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:resetPasswordToken", resetPassword);
router.patch("/change-password", protect, changePassword);

// User Profile
router.route("/user")
    .get(protect, getMe)
    .patch(protect, updateUser);

export default router;
