import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import "dotenv/config";

const prisma = new PrismaClient();

async function seedUsers() {
  const users = [
    { name: "Admin", email: "admin@admin.com", password: "admin123", role: "ADMIN" as const },
    { name: "Moderator", email: "moderator@moderator.com", password: "moderator123", role: "MODERATOR" as const },
  ];

  console.log("Seeding users...");

  for (const user of users) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });

    if (!existing) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(user.password, salt);

      await prisma.user.create({
        data: {
          name: user.name,
          email: user.email,
          password: hashedPassword,
          role: user.role,
          isVerified: true,
        },
      });
      console.log(`Created user: ${user.email} (${user.role})`);
    } else {
      console.log(`User already exists: ${user.email}`);
    }
  }

  console.log("Users seeding completed.");
}

async function main() {
  await seedUsers();

  const days = [
    "Saturday",
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
  ];

  console.log("Seeding working days...");

  for (const day of days) {
    const existingDay = await prisma.workingDay.findUnique({
      where: { day },
    });

    if (!existingDay) {
      await prisma.workingDay.create({
        data: {
          day,
          isOpen: true, // Default to true as per schema
          startTime: "09:00",
          endTime: "17:00",
        },
      });
      console.log(`Created working day: ${day}`);
    } else {
      console.log(`Working day already exists: ${day}`);
    }
  }

  console.log("Working days seeding completed.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
