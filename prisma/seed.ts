import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
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
