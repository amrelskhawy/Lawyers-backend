import chalk from "chalk";

const timestamp = () => chalk.gray(new Date().toISOString());

const logger = {
    info: (message: string, ...args: any[]) => {
        console.log(`${timestamp()} ${chalk.blue.bold("[INFO]")} ${chalk.cyan(message)}`, ...args);
    },
    success: (message: string, ...args: any[]) => {
        console.log(`${timestamp()} ${chalk.green.bold("[SUCCESS]")} ${chalk.green(message)}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
        console.warn(`${timestamp()} ${chalk.yellow.bold("[WARN]")} ${chalk.yellow(message)}`, ...args);
    },
    error: (message: string, ...args: any[]) => {
        console.error(`${timestamp()} ${chalk.red.bold("[ERROR]")} ${chalk.red(message)}`, ...args);
    },
    request: (method: string, url: string, status: number, responseTime: string, body?: string) => {
        const statusColor =
            status >= 500 ? chalk.red.bold :
            status >= 400 ? chalk.yellow.bold :
            status >= 300 ? chalk.cyan.bold :
            chalk.green.bold;

        const methodColor =
            method === "GET"    ? chalk.green.bold(method.padEnd(7)) :
            method === "POST"   ? chalk.blue.bold(method.padEnd(7)) :
            method === "PUT"    ? chalk.yellow.bold(method.padEnd(7)) :
            method === "PATCH"  ? chalk.magenta.bold(method.padEnd(7)) :
            method === "DELETE" ? chalk.red.bold(method.padEnd(7)) :
            chalk.white.bold(method.padEnd(7));

        const line = `${timestamp()} ${chalk.white.bold("[REQ]")} ${methodColor} ${chalk.white(url)} ${statusColor(String(status))} ${chalk.gray(responseTime + "ms")}`;

        if (body && body.trim() && body !== "{}") {
            console.log(`${line} ${chalk.gray("body:")} ${chalk.gray(body)}`);
        } else {
            console.log(line);
        }
    },
};

export default logger;
