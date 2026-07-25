import { Router } from 'express';
import { ProfileController } from './profile.controller';
import { requireJWT } from '../../middleware/jwt.middleware';

export const profileRouter = Router();

profileRouter.use(requireJWT);

profileRouter.get('/', ProfileController.getProfile);
profileRouter.patch('/', ProfileController.updateProfile);
