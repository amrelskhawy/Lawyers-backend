import { Router } from "express";
import { changePassword, forgotPassword, getUser, resetPassword, updateUser, userLoginStatus, verifyEmail, verifyUser } from "../../../models/users/userController";
import { protect } from "../../../models/auth/middlewares/authMiddleware";
import { loginUser, logoutUser, registerUser } from "../../../models/auth/authController";


const router = Router();

// login status
router.get("/login-status", userLoginStatus);
// email verification
router.post("/verify-email", protect, verifyEmail);
// verify user --> email verification
router.post("/verify-user/:verificationToken", verifyUser);
// forgot password
router.post("/forgot-password", forgotPassword);
//reset password
router.post("/reset-password/:resetPasswordToken", resetPassword);
// change password ---> user must be logged in
router.patch("/change-password", protect, changePassword);


router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/logout", logoutUser);


router.get("/user", protect, getUser);
router.patch("/user", protect, updateUser);


export default router;

