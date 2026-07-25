import { Request, Response } from 'express';
import { ProgressService } from './progress.service';
import { catchAsync } from '../../middleware/error_handling';

export class ProgressController {
  static getProgress = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const data = await ProgressService.getProgress(req.user?.id);
    res.json({ success: true, data });
  });
}
