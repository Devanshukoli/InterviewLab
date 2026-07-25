import { Request, Response } from 'express';
import { HistoryService } from './history.service';
import { BadRequestError, NotFoundError, catchAsync } from '../../middleware/error_handling';

export class HistoryController {
  static getResumes = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const data = await HistoryService.getResumes();
    res.json({ success: true, data });
  });

  static deleteResume = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!id) {
      throw new BadRequestError('Resume ID parameter is required');
    }
    await HistoryService.deleteResume(id);
    res.json({ success: true, message: 'Resume deleted successfully' });
  });

  static getJobDescriptions = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const data = await HistoryService.getJobDescriptions();
    res.json({ success: true, data });
  });
}
