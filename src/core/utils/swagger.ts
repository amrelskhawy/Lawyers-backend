import swaggerJsdoc from "swagger-jsdoc";
import pkg from "../../../package.json" with { type: "json" };
const { version } = pkg;

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Lawyers Backend API",
            version,
            description: "API documentation for the Lawyers Backend application",
        },
        servers: [
            {
                url: "/api/v1",
                description: "V1 API Server",
            },
        ],
        components: {
            securitySchemes: {
                cookieAuth: {
                    type: "apiKey",
                    in: "cookie",
                    name: "token",
                },
            },
        },
        security: [
            {
                cookieAuth: [],
            },
        ],
    },
    apis: [
        "./src/modules/**/*.ts",
        "./src/modules/**/*.swagger.ts",
        "./src/modules/moderators/moderators.swagger.ts",
        "./dist/modules/**/*.js",
        "./dist/modules/**/*.swagger.js",
        "./src/core/routes/**/*.ts",
        "./dist/core/routes/**/*.js",
    ],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
