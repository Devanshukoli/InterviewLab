import { Router } from 'express';
import { BillingController } from './billing.controller';
import { requireJWT } from '../../middleware/jwt.middleware';

export const billingRouter = Router();

billingRouter.use(requireJWT);

billingRouter.get('/history', BillingController.getHistory);
billingRouter.get('/subscription', BillingController.getSubscription);
