import { Request, Response } from 'express';
import { ProfileService } from './profile.service';
import { UnauthorizedError, catchAsync } from '../../middleware/error_handling';

export class ProfileController {
  static getProfile = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = await ProfileService.getProfile();
    if (!user) {
      throw new UnauthorizedError('User session not found');
    }
    res.json({ success: true, data: user });
  });

  static updateProfile = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { name } = req.body;
    const user = await ProfileService.updateProfile(name);
    res.json({ success: true, data: user });
  });
}
