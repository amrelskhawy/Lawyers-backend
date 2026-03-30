import nodeMailer from "nodemailer";
import path from "path";
import hbs from "nodemailer-express-handlebars";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const sendEmail = async (
    subject: string,
    send_to: string,
    send_from: string,
    reply_to: string,
    template: string,
    name: string,
    link: string
) => {
    const transporter = nodeMailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const handlebarsOptions: any = {
        viewEngine: {
            extName: ".handlebars",
            partialsDir: path.resolve(__dirname, "../../views"),
            defaultLayout: false,
            helpers: {
                eq: (v1: any, v2: any) => v1 === v2,
            },
        },
        viewPath: path.resolve(__dirname, "../../views"),
        extName: ".handlebars",
    };

    transporter.use("compile", hbs(handlebarsOptions));

    const mailOptions = {
        from: send_from,
        to: send_to,
        replyTo: reply_to,
        subject: subject,
        template: template,
        context: {
            name: name,
            link: link,
        },
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("Message sent: %s", info.messageId);
        return info;
    } catch (error) {
        console.error("Error sending email: ", error);
        throw error;
    }
};

export const sendEmailWithTemplate = async (
    to: string,
    subject: string,
    template: string,
    context: any,
    attachments?: { filename: string; content: Buffer; contentType: string }[]
) => {
    const transporter = nodeMailer.createTransport({
        host: process.env.EMAIL_HOST ?? "smtp.hostinger.com",
        port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT) : 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const handlebarsOptions: any = {
        viewEngine: {
            extName: ".handlebars",
            partialsDir: path.resolve(__dirname, "../../views"),
            defaultLayout: false,
            helpers: {
                eq: (v1: any, v2: any) => v1 === v2,
            },
        },
        viewPath: path.resolve(__dirname, "../../views"),
        extName: ".handlebars",
    };

    transporter.use("compile", hbs(handlebarsOptions));

    const mailOptions: any = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        template,
        context,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("Message sent to %s: %s", to, info.messageId);
        return info;
    } catch (error) {
        console.error("Error sending email: ", error);
        throw error;
    }
};
