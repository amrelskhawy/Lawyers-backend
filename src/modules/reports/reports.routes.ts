import { Router } from 'express';
import {
  createSessionReport,
  generateReport,
  previewReport,
  sendReport,
  listReports,
} from './reports.controller.js';
import { protect, moderatorMiddleware } from '../../core/middlewares/authMiddleware.js';

const router = Router();

// All routes require authentication
router.use(protect, moderatorMiddleware);

// ── CRUD + Pipeline ───────────────────────────────────────────────────────────

/**
 * POST /reports/session
 * Create a new report draft (no PDF yet)
 */
router.post('/session', createSessionReport);

/**
 * GET /reports/session
 * List all reports (paginated) — admin/moderator use
 */
router.get('/session', listReports);

/**
 * POST /reports/session/:id/generate
 * Queue PDF generation for a draft report
 */
router.post('/session/:id/generate', generateReport);

/**
 * GET /reports/session/:id/preview
 * Get report details + preview URL (only works when status = READY | SENT)
 */
router.get('/session/:id/preview', previewReport);

/**
 * POST /reports/session/:id/send
 * Send report to client via email / sms / whatsapp
 * Body: { channel: "email" | "sms" | "whatsapp", destination: "..." }
 */
router.post('/session/:id/send', sendReport);

export default router;
