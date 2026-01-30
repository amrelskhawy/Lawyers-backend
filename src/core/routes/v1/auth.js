import { Router } from "express";
import { getUser, updateUser } from "../../../models/users/userController.js";
import { protect } from "../../../models/auth/middlewares/authMiddleware.js";
import { 
  changePassword, 
  forgotPassword, 
  loginUser, 
  logoutUser, 
  registerUser, 
  resetPassword, 
  userLoginStatus, 
  verifyEmail, 
  verifyUser 
} from "../../../models/auth/authController.js";


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

