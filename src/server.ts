import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorHandler } from "./core/middlewares/errorMiddleware.js";
import prisma from "./core/db/prisma.js";
import v1Routes from "./core/routes/v1/index.js";
import { Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./core/utils/swagger.js";

dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

const allowedOrigins = [
    process.env.CLIENT_URL,
    "http://localhost:3000",
    "http://localhost:4200",
    "http://localhost:5173",
];

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl)
            if (!origin) return callback(null, true);

            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/v1", v1Routes);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(errorHandler);

app.get('/', (req: Request, res: Response) => {
    return res.json({ message: "Hello World" })
})

const startServer = async () => {
    try {
        await prisma.$connect();
        console.log("Connected to database");

        if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
            app.listen(port, () => {
                console.log(`Server is running on port ${port}`);
            });
        }
    } catch (error: any) {
        console.log("Failed to start server!", error.message);
        if (process.env.NODE_ENV !== "production") {
            process.exit(1);
        }
    }
};

startServer();

export default app;
