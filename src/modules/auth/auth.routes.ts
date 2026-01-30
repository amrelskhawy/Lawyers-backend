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
import { protect } from "../../core/middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/logout", logoutUser);
router.get("/login-status", userLoginStatus);
router.post("/verify-email", protect, verifyEmail);
router.post("/verify-user/:verificationToken", verifyUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:resetPasswordToken", resetPassword);
router.patch("/change-password", protect, changePassword);

router.get("/user", protect, getUser);
router.patch("/user", protect, updateUser);

export default router;
