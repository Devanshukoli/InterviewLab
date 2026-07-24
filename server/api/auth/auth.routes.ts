import { Router } from 'express';
import { AuthController } from './auth.controller';

export const authRouter = Router();

authRouter.post('/register', AuthController.register);
authRouter.post('/login', AuthController.login);
authRouter.get('/google/url', AuthController.googleUrl);
authRouter.get('/google/callback', AuthController.googleCallback);
authRouter.post('/google', AuthController.google);
authRouter.get('/me', AuthController.me);
authRouter.get('/logins', AuthController.logins);
authRouter.post('/change-password', AuthController.changePassword);
authRouter.post('/2fa/setup', AuthController.setup2FA);
authRouter.post('/2fa/verify', AuthController.verify2FA);
authRouter.post('/2fa/login-verify', AuthController.verifyLogin2FA);
authRouter.post('/2fa/disable', AuthController.disable2FA);
authRouter.get('/sessions', AuthController.getSessions);
authRouter.delete('/sessions/:sessionId', AuthController.revokeSession);
