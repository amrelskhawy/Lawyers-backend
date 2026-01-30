import asyncHandler from "express-async-handler";
import prisma from "../../core/db/prisma.js";

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

