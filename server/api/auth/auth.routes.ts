import { Router } from 'express';
import { AuthController } from './auth.controller';
import { requireJWT } from '../../middleware/jwt.middleware';

export const authRouter = Router();

authRouter.post('/register', AuthController.register);
authRouter.post('/login', AuthController.login);
authRouter.post('/refresh', AuthController.refresh);
authRouter.post('/logout', AuthController.logout);
authRouter.get('/google/url', AuthController.googleUrl);
authRouter.get('/google/callback', AuthController.googleCallback);
authRouter.post('/google', AuthController.google);
authRouter.post('/request-reset', AuthController.requestPasswordReset);
authRouter.post('/reset-password', AuthController.resetPassword);
authRouter.post('/2fa/login-verify', AuthController.verifyLogin2FA);

authRouter.get('/me', requireJWT, AuthController.me);
authRouter.get('/logins', requireJWT, AuthController.logins);
authRouter.post('/change-password', requireJWT, AuthController.changePassword);
authRouter.post('/2fa/setup', requireJWT, AuthController.setup2FA);
authRouter.post('/2fa/verify', requireJWT, AuthController.verify2FA);
authRouter.post('/2fa/disable', requireJWT, AuthController.disable2FA);
authRouter.get('/sessions', requireJWT, AuthController.getSessions);
authRouter.delete('/sessions/:sessionId', requireJWT, AuthController.revokeSession);
