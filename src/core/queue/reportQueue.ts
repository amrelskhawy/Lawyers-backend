import { Queue, Worker, Job } from 'bullmq';
import { ReportStatus } from '@prisma/client';
import { generateReportPDF } from '../../modules/reports/services/pdf.service.js';
import logger from '../utils/logger.js';
import prisma from '../db/prisma.js';

//redis connecting — uses REDIS_URL for Upstash, falls back to localhost
const redisConnection = process.env.REDIS_URL
    ? { url: process.env.REDIS_URL }
    : {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD || undefined,
    };

//queue definition 
export const reportQueue = new Queue('report-generation', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100, // keep last 100 completed jobs for debugging
        removeOnFail: 200,
    },
});

export interface ReportJobData {
    reportId: string;
}


export function startReportWorker(): Worker {
    const worker = new Worker<ReportJobData>(
        'report-generation',
        async (job: Job<ReportJobData>) => {
            const { reportId } = job.data;
            logger.info(`Processing report job ${job.id} for report ${reportId}`);

            // 1. Mark as GENERATING
            await prisma.sessionReport.update({
                where: { id: reportId },
                data: { status: ReportStatus.GENERATING },
            });

            // 2. Fetch the full report record
            const report = await prisma.sessionReport.findUniqueOrThrow({
                where: { id: reportId },
            });

            // 3. Generate PDF
            const { pdfPath, pdfUrl } = await generateReportPDF(report);

            // 4. Save path + URL, mark as READY
            await prisma.sessionReport.update({
                where: { id: reportId },
                data: { pdfPath, pdfUrl, status: ReportStatus.READY },
            });

            logger.info(`Report ${reportId} is READY — ${pdfUrl}`);
        },
        { connection: redisConnection, concurrency: 2 }
    );

    worker.on('failed', async (job, err) => {
        if (!job) return;
        logger.error(`Report job ${job.id} failed: ${err?.message}`);

        // Reset to DRAFT so the user can retry
        await prisma.sessionReport.update({
            where: { id: job.data.reportId },
            data: { status: ReportStatus.DRAFT },
        }).catch(() => {/* ignore if record missing */ });
    });

    worker.on('completed', (job) => {
        logger.info(`Report job ${job.id} completed successfully`);
    });

    logger.info('Report generation worker started');
    return worker;
}
