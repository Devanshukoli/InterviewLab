import { Router } from 'express';
import { ByokController } from './byok.controller';
import { requireJWT } from '../../middleware/jwt.middleware';

export const byokRouter = Router();

byokRouter.use(requireJWT);

byokRouter.get('/status', ByokController.getStatus);
byokRouter.get('/keys', ByokController.getKeys);
byokRouter.post('/keys', ByokController.saveKey);
byokRouter.delete('/keys/:provider', ByokController.deleteKey);
byokRouter.post('/test-connection', ByokController.testConnection);
byokRouter.get('/models/:provider', ByokController.getModels);
byokRouter.patch('/keys/:provider/model', ByokController.updatePreferredModel);
