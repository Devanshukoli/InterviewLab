import { Request, Response } from 'express';
import { BillingService } from './billing.service';
import { catchAsync } from '../../middleware/error_handling';

export class BillingController {
  static getHistory = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const data = await BillingService.getHistory(req.user!.id);
    res.json({ success: true, data });
  });

  static getSubscription = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const data = await BillingService.getSubscription(req.user!.id);
    res.json({ success: true, data });
  });
}
