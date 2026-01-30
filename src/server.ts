import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorHandler } from "@core/middlewares/errorMiddleware.js";
import prisma from "@core/db/prisma.js";
import v1Routes from "@core/routes/v1/index.js";

dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

app.use(
    cors({
        origin: process.env.CLIENT_URL,
        credentials: true,
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/v1", v1Routes);

app.use(errorHandler);

const startServer = async () => {
    try {
        await prisma.$connect();
        console.log("Connected to database");

        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    } catch (error: any) {
        console.log("Failed to start server!", error.message);
        process.exit(1);
    }
};

startServer();
