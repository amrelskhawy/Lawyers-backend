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
    apis: ["./src/modules/**/*.ts", "./src/core/routes/**/*.ts"],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
