import { Router } from 'express';
import { authRouter } from './auth/auth.routes';
import { interviewRouter } from './interview/interview.routes';
import { billingRouter } from './billing/billing.routes';
import { historyRouter } from './history/history.routes';
import { progressRouter } from './progress/progress.routes';
import { profileRouter } from './profile/profile.routes';
import { telemetryRouter } from './telemetry/telemetry.routes';
import { byokRouter } from './byok/byok.routes';
import { generalLimiter, authLimiter, llmLimiter } from '../middleware/rateLimit';

export const apiRouter = Router();

// Apply general rate limit to all /api endpoints
apiRouter.use(generalLimiter);

apiRouter.use('/auth', authLimiter, authRouter);
apiRouter.use('/interview', llmLimiter, interviewRouter);
apiRouter.use('/byok', byokRouter);
apiRouter.use('/billing', billingRouter);
apiRouter.use('/history', historyRouter);
apiRouter.use('/progress', progressRouter);
apiRouter.use('/profile', profileRouter);
apiRouter.use('/telemetry', telemetryRouter);

// Alias routes for direct legacy endpoint compatibility
apiRouter.use('/', historyRouter); // handles GET /api/resumes, DELETE /api/resumes/:id
