import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorHandler } from "./core/middlewares/errorMiddleware.js";
import prisma from "./core/db/prisma.js";
import v1Routes from "./core/routes/v1/index.js";
import { Request, Response } from "express";
import { apiReference } from "@scalar/express-api-reference";
import swaggerSpec from "./core/utils/swagger.js";
import { chatbotService } from "./modules/chatbot/chatbot.service.js";
import paymentRoutes from "./modules/payment/payment.routes.js";

dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

app.use(
    cors({
        origin: true,
        credentials: true,
    })
);

app.use((req, res, next) => {
    if (req.originalUrl.startsWith("/payment/webhook")) return next();
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
        console.log("Connected to database");

        // Initialize Chatbot (load context)
        await chatbotService.initialize();

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
