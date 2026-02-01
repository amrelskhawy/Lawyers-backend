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
import { getUser, updateUser } from "../users/users.controller.js";
import { protect, checkUserAuth } from "../../core/middlewares/authMiddleware.js";

const router = express.Router();

// Session Management
router.post("/register", checkUserAuth, registerUser);
router.post("/login", checkUserAuth, loginUser);
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
    .get(protect, getUser)
    .patch(protect, updateUser);

export default router;
