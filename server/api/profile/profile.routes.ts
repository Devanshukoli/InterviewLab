import { Router } from 'express';
import { ProfileController } from './profile.controller';
import { requireJWT } from '../../middleware/jwt.middleware';
import { validateBody } from '../../middleware/validation';
import {
  updateProfileSchema,
  deleteProfileSchema,
  clearSpecificDataSchema,
} from '../../dtos/profile.dto';

export const profileRouter = Router();

profileRouter.use(requireJWT);

profileRouter.get('/', ProfileController.getProfile);
profileRouter.patch('/', validateBody(updateProfileSchema), ProfileController.updateProfile);
profileRouter.delete('/', validateBody(deleteProfileSchema), ProfileController.deleteProfile);
profileRouter.get('/export', ProfileController.exportData);
profileRouter.post('/privacy/clear', validateBody(clearSpecificDataSchema), ProfileController.clearSpecificData);

