import { Router } from 'express';
import { ProgressController } from './progress.controller';
import { requireJWT } from '../../middleware/jwt.middleware';

export const progressRouter = Router();

progressRouter.use(requireJWT);

progressRouter.get('/', ProgressController.getProgress);
