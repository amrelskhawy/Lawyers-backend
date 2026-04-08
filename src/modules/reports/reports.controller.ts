import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { ReportStatus } from '@prisma/client';
import { CreateSessionReport, SendReportDto } from './reports.validation.js';
import { reportQueue } from '../../core/queue/reportQueue.js';
import { deliverReport } from './services/delivery.service.js';
import prisma from '../../core/db/prisma.js';
import { AppResponse } from '../../core/utils/AppResponse.js';


export const createSessionReport = asyncHandler(async (req: Request, res: Response) => {
  const body = CreateSessionReport.parse(req.body);

  const report = await prisma.sessionReport.create({
    data: {
      // Client
      clientName: body.client.name,
      clientPhone: body.client.phone,
      clientDate: new Date(body.client.date),
      caseType: body.client.caseType,

      // Lawyer
      specificLawyerRequested: body.lawyer.specificLawyerRequested,
      lawyerName: body.lawyer.name ?? null,

      // Documents
      hasIdCopy: body.documents.idCopy,
      hasAbsherMobile: body.documents.absherMobile,
      hasNationalAddress: body.documents.nationalAddress,
      hasDocumentsCopy: body.documents.documentsCopy,
      hasTawakkalna: body.documents.tawakkalna,

      // Session (optional on creation)
      sessionReceiverName: body.session?.receiverName ?? null,
      sessionDate: body.session?.sessionDate ? new Date(body.session.sessionDate) : null,
      strengths: body.session?.strengths ?? null,
      weaknesses: body.session?.weaknesses ?? null,
      gaps: body.session?.gaps ?? null,

      status: ReportStatus.DRAFT,
    },
  });

  res.status(201).json(new AppResponse(true, 'REPORT_DRAFT_CREATED', report, 201));
});


export const generateReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const report = await prisma.sessionReport.findUniqueOrThrow({ where: { id } });

  if (report.status === ReportStatus.GENERATING) {
    res.status(409).json(new AppResponse(false, 'REPORT_ALREADY_GENERATING', null, 409));
    return;
  }

  if (report.status === ReportStatus.READY || report.status === ReportStatus.SENT) {
    // Allow re-generation (e.g. after editing)
    await prisma.sessionReport.update({
      where: { id },
      data: { status: ReportStatus.DRAFT, pdfPath: null, pdfUrl: null },
    });
  }

  const job = await reportQueue.add('generate', { reportId: id });

  res.status(200).json(new AppResponse(true, 'REPORT_GENERATION_QUEUED', {
    reportId: id,
    jobId: job.id,
    status: ReportStatus.GENERATING,
  }));
});


export const previewReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const report = await prisma.sessionReport.findUniqueOrThrow({ where: { id } });

  if (report.status !== ReportStatus.READY && report.status !== ReportStatus.SENT) {
    const statusCode = report.status === ReportStatus.GENERATING ? 202 : 400;
    res.status(statusCode).json(new AppResponse(
      false,
      'REPORT_NOT_READY',
      { status: report.status },
      statusCode
    ));
    return;
  }

  const previewUrl = report.pdfUrl
    ? `${process.env.APP_BASE_URL}${report.pdfUrl}`
    : null;

  res.status(200).json(new AppResponse(true, 'REPORT_PREVIEW', {
    id: report.id,
    status: report.status,
    clientName: report.clientName,
    clientPhone: report.clientPhone,
    caseType: report.caseType,
    createdAt: report.createdAt,
    previewUrl,
  }));
});

export const sendReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = SendReportDto.parse(req.body);

  const report = await prisma.sessionReport.findUniqueOrThrow({ where: { id } });

  if (report.status !== ReportStatus.READY && report.status !== ReportStatus.SENT) {
    res.status(400).json(new AppResponse(false, 'REPORT_NOT_READY_TO_SEND', { status: report.status }, 400));
    return;
  }

  if (!report.pdfUrl) {
    res.status(500).json(new AppResponse(false, 'REPORT_PDF_MISSING', null, 500));
    return;
  }

  await deliverReport({
    channel: body.channel,
    destination: body.destination,
    reportId: report.id,
    previewUrl: report.pdfUrl,
    clientName: report.clientName,
    pdfPath: report.pdfPath ?? undefined,
  });

  const updatedReport = await prisma.sessionReport.update({
    where: { id },
    data: {
      status: ReportStatus.SENT,
      sentAt: new Date(),
      sentVia: body.channel,
    },
  });

  res.status(200).json(new AppResponse(true, 'REPORT_SENT', {
    reportId: id,
    channel: body.channel,
    destination: body.destination,
    sentAt: updatedReport.sentAt,
  }));
});

export const listReports = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const skip = (page - 1) * limit;

  const [reports, total] = await Promise.all([
    prisma.sessionReport.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        clientName: true,
        clientPhone: true,
        caseType: true,
        status: true,
        createdAt: true,
        sentAt: true,
        sentVia: true,
        pdfUrl: true,
      },
    }),
    prisma.sessionReport.count(),
  ]);

  res.status(200).json(new AppResponse(true, 'REPORTS_LIST', { reports, total, page, limit }));
});
