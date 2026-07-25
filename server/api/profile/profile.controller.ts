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
}
