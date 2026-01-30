import asyncHandler from "express-async-handler";
import prisma from "../../db/prisma.js";
import generateToken from "../../helpers/generateToken.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import hashToken from "../../helpers/hashToken.js";
import sendEmail from "../../helpers/sendEmail.js";


// register user
export const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  //validation
  if (!name || !email || !password) {
    // 400 Bad Request
    res.status(400).json({ message: "All fields are required" });
  }

  // check password length
  if (password.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });
  }

  // check if user already exists
  const userExists = await prisma.user.findUnique({ where: { email } });

  if (userExists) {
    // bad request
    return res.status(400).json({ message: "User already exists" });
  }

  // hash the password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // create new user
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
    },
  });

  // generate token with user id
  const token = generateToken(user.id);

  // send back the user and token in the response to the client
  res.cookie("token", token, {
    path: "/",
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: "none", // cross-site access --> allow all third-party cookies
    secure: true,
  });

  if (user) {
    const { id, name, email, role, photo, bio, isVerified } = user;

    // 201 Created
    res.status(201).json({
      id,
      name,
      email,
      role,
      photo,
      bio,
      isVerified,
      token,
    });
  } else {
    res.status(400).json({ message: "Invalid user data" });
  }
});

// user login
export const loginUser = asyncHandler(async (req, res) => {
  // get email and password from req.body
  const { email, password } = req.body;

  // validation
  if (!email || !password) {
    // 400 Bad Request
    return res.status(400).json({ message: "All fields are required" });
  }

  // check if user exists
  const userExists = await prisma.user.findUnique({ where: { email } });

  if (!userExists) {
    return res.status(404).json({ message: "User not found, sign up!" });
  }

  // check id the password match the hashed password in the database
  const isMatch = await bcrypt.compare(password, userExists.password);

  if (!isMatch) {
    // 400 Bad Request
    return res.status(400).json({ message: "Invalid credentials" });
  }

  // generate token with user id
  const token = generateToken(userExists.id);

  if (userExists && isMatch) {
    const { id, name, email, role, photo, bio, isVerified } = userExists;

    // set the token in the cookie
    res.cookie("token", token, {
      path: "/",
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "none", // cross-site access --> allow all third-party cookies
      secure: true,
    });

    // send back the user and token in the response to the client
    res.status(200).json({
      id,
      name,
      email,
      role,
      photo,
      bio,
      isVerified,
      token,
    });
  } else {
    res.status(400).json({ message: "Invalid email or password" });
  }
});

// logout user
export const logoutUser = asyncHandler(async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
  });

  res.status(200).json({ message: "User logged out" });
});

// get user
export const getUser = asyncHandler(async (req, res) => {
  // get user details from the token ----> exclude password
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      photo: true,
      bio: true,
      role: true,
      isVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (user) {
    res.status(200).json(user);
  } else {
    // 404 Not Found
    res.status(404).json({ message: "User not found" });
  }
});

// update user
export const updateUser = asyncHandler(async (req, res) => {
  // get user details from the token ----> protect middleware
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });

  if (user) {
    // user properties to update
    const { name, bio, photo } = req.body;

    // update user properties
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: name || user.name,
        bio: bio || user.bio,
        photo: photo || user.photo,
      },
    });

    res.status(200).json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      photo: updated.photo,
      bio: updated.bio,
      isVerified: updated.isVerified,
    });
  } else {
    // 404 Not Found
    res.status(404).json({ message: "User not found" });
  }
});

// login status
export const userLoginStatus = asyncHandler(async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    // 401 Unauthorized
    res.status(401).json({ message: "Not authorized, please login!" });
  }
  // verify the token
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  if (decoded) {
    res.status(200).json(true);
  } else {
    res.status(401).json(false);
  }
});

// email verification
export const verifyEmail = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });

  // if user exists
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // check if user is already verified
  if (user.isVerified) {
    return res.status(400).json({ message: "User is already verified" });
  }

  let token = await prisma.token.findFirst({ where: { userId: user.id } });

  // if token exists --> delete the token
  if (token) {
    await prisma.token.delete({ where: { id: token.id } });
  }

  // create a verification token using the user id --->
  const verificationToken = crypto.randomBytes(64).toString("hex") + user.id;

  // hast the verification token
  const hashedToken = hashToken(verificationToken);

  await prisma.token.create({
    data: {
      userId: user.id,
      verificationToken: hashedToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
  });

  // verification link
  const verificationLink = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;

  // send email
  const subject = "Email Verification";
  const send_to = user.email;
  const reply_to = "noreply@gmail.com";
  const template = "emailVerification";
  const send_from = process.env.EMAIL_USER;
  const name = user.name;
  const url = verificationLink;

  try {
    // order matters ---> subject, send_to, send_from, reply_to, template, name, url
    await sendEmail(subject, send_to, send_from, reply_to, template, name, url);
    return res.json({ message: "Email sent" });
  } catch (error) {
    console.log("Error sending email: ", error);
    return res.status(500).json({ message: "Email could not be sent" });
  }
});

// verify user
export const verifyUser = asyncHandler(async (req, res) => {
  const { verificationToken } = req.params;

  if (!verificationToken) {
    return res.status(400).json({ message: "Invalid verification token" });
  }
  // hash the verification token --> because it was hashed before saving
  const hashedToken = hashToken(verificationToken);

  // find user with the verification token
  const userToken = await prisma.token.findFirst({
    where: {
      verificationToken: hashedToken,
      // check if the token has not expired
      expiresAt: { gt: new Date() },
    },
  });

  if (!userToken) {
    return res
      .status(400)
      .json({ message: "Invalid or expired verification token" });
  }

  //find user with the user id in the token
  const user = await prisma.user.findUnique({ where: { id: userToken.userId } });

  if (user.isVerified) {
    // 400 Bad Request
    return res.status(400).json({ message: "User is already verified" });
  }

  // update user to verified
  await prisma.user.update({
    where: { id: user.id },
    data: { isVerified: true },
  });
  res.status(200).json({ message: "User verified" });
});

// forgot password
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  // check if user exists
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // 404 Not Found
    return res.status(404).json({ message: "User not found" });
  }

  // see if reset token exists
  let token = await prisma.token.findFirst({ where: { userId: user.id } });

  // if token exists --> delete the token
  if (token) {
    await prisma.token.delete({ where: { id: token.id } });
  }

  // create a reset token using the user id ---> expires in 1 hour
  const passwordResetToken = crypto.randomBytes(64).toString("hex") + user.id;

  // hash the reset token
  const hashedToken = hashToken(passwordResetToken);

  await prisma.token.create({
    data: {
      userId: user.id,
      passwordResetToken: hashedToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    },
  });

  // reset link
  const resetLink = `${process.env.CLIENT_URL}/reset-password/${passwordResetToken}`;

  // send email to user
  const subject = "Password Reset - AuthKit";
  const send_to = user.email;
  const send_from = process.env.EMAIL_USER;
  const reply_to = "noreply@noreply.com";
  const template = "forgotPassword";
  const name = user.name;
  const url = resetLink;

  try {
    await sendEmail(subject, send_to, send_from, reply_to, template, name, url);
    res.json({ message: "Email sent" });
  } catch (error) {
    console.log("Error sending email: ", error);
    return res.status(500).json({ message: "Email could not be sent" });
  }
});

// reset password
export const resetPassword = asyncHandler(async (req, res) => {
  const { resetPasswordToken } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ message: "Password is required" });
  }

  // hash the reset token
  const hashedToken = hashToken(resetPasswordToken);

  // check if token exists and has not expired
  const userToken = await prisma.token.findFirst({
    where: {
      passwordResetToken: hashedToken,
      // check if the token has not expired
      expiresAt: { gt: new Date() },
    },
  });

  if (!userToken) {
    return res.status(400).json({ message: "Invalid or expired reset token" });
  }

  // find user with the user id in the token
  const user = await prisma.user.findUnique({ where: { id: userToken.userId } });

  // hash the new password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // update user password
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  res.status(200).json({ message: "Password reset successfully" });
});

// change password
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "All fields are required" });
  }

  //find user by id
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });

  // compare current password with the hashed password in the database
  const isMatch = await bcrypt.compare(currentPassword, user.password);

  if (!isMatch) {
    return res.status(400).json({ message: "Invalid password!" });
  }

  // hash the new password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  // reset password
  if (isMatch) {
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });
    return res.status(200).json({ message: "Password changed successfully" });
  } else {
    return res.status(400).json({ message: "Password could not be changed!" });
  }
});