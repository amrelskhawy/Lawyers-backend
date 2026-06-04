import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { errorHandler } from "./core/middlewares/errorMiddleware.js";
import prisma from "./core/db/prisma.js";
import v1Routes from "./core/routes/v1/index.js";
import { Request, Response } from "express";
import { apiReference } from "@scalar/express-api-reference";
import swaggerSpec from "./core/utils/swagger.js";
import { chatbotService } from "./modules/chatbot/chatbot.service.js";
import logger from "./core/utils/logger.js";
import { startReminderCron } from "./core/services/scheduler/reminders.cron.js";

dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

app.use(
    cors({
        origin: true,
        credentials: true,
    })
);

// Colored request logging
morgan.token("body", (req: Request) => {
    if (req.method === "GET") return "";
    const body = { ...(req as any).body };
    for (const key of ["password", "token", "secret", "creditCard"]) {
        if (body[key]) body[key] = "[REDACTED]";
    }
    return JSON.stringify(body);
});

app.use(
    morgan(
        (tokens, req, res) => {
            const method = tokens.method(req, res) || "GET";
            const url = tokens.url(req, res) || "/";
            const status = parseInt(tokens.status(req, res) || "0", 10);
            const responseTime = tokens["response-time"](req, res) || "0";
            const body = tokens["body"](req, res) || "";
            logger.request(method, url, status, responseTime, body);
            return null; // suppress morgan's default output
        },
        {
            skip: (req) => req.url === "/" || req.url?.startsWith("/api-docs"),
        }
    )
);

app.use((req, res, next) => {
    if (req.originalUrl.startsWith("/api/v1/payment/webhook")) return next();
    express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/api-docs-json", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
});

// Setup Scalar API Reference
app.use(
    "/api-docs",
    apiReference({
        content: swaggerSpec,
        theme: "purple",
    })
);

app.get('/', (req: Request, res: Response) => {
    return res.json({ message: "Hello World" })
})

app.use("/api/v1", v1Routes);

app.use(errorHandler);

const startServer = async () => {
    try {
        await prisma.$connect();
        logger.success("Connected to database");

        // Initialize Chatbot (load context)
        await chatbotService.initialize();
        logger.success("Chatbot initialized");

        if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
            app.listen(port, () => {
                logger.success(`Server is running on port ${port}`);
            });
            startReminderCron();
        }
    } catch (error: any) {
        logger.error("Failed to start server!", error.message);
        if (process.env.NODE_ENV !== "production") {
            process.exit(1);
        }
    }
};

startServer();

export default app;
