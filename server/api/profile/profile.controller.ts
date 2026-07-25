import { Request, Response } from 'express';
import { ProfileService } from './profile.service';
import { catchAsync } from '../../middleware/error_handling';

export class ProfileController {
  static getProfile = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const data = await ProfileService.getProfile(user.id, user.email);
    res.json({ success: true, data });
  });

  static updateProfile = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const data = await ProfileService.updateProfile(user.id, user.email, req.body);
    res.json({ success: true, data });
  });

  static deleteProfile = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const password = req.body?.password || req.query?.password as string;
    await ProfileService.deleteProfile(user.id, user.email, password);
    res.json({ success: true, message: 'Account and associated data deleted successfully.' });
  });

  static exportData = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const data = await ProfileService.exportData(user.id, user.email);
    res.json({ success: true, data });
  });

  static clearSpecificData = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const { category } = req.body;
    const result = await ProfileService.clearSpecificData(user.id, user.email, category);
    res.json(result);
  });
}
