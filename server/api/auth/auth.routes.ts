import { Router } from 'express';
import { AuthController } from './auth.controller';
import { requireJWT } from '../../middleware/jwt.middleware';
import { validateBody } from '../../middleware/validation';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  requestResetSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyLogin2FASchema,
  verify2FASchema,
  googleAuthSchema,
} from '../../dtos/auth.dto';

export const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), AuthController.register);
authRouter.post('/login', validateBody(loginSchema), AuthController.login);
authRouter.post('/refresh', validateBody(refreshSchema), AuthController.refresh);
authRouter.post('/logout', AuthController.logout);
authRouter.get('/google/url', AuthController.googleUrl);
authRouter.get('/google/callback', AuthController.googleCallback);
authRouter.post('/google', validateBody(googleAuthSchema), AuthController.google);
authRouter.post('/request-reset', validateBody(requestResetSchema), AuthController.requestPasswordReset);
authRouter.post('/reset-password', validateBody(resetPasswordSchema), AuthController.resetPassword);
authRouter.post('/2fa/login-verify', validateBody(verifyLogin2FASchema), AuthController.verifyLogin2FA);

authRouter.get('/me', requireJWT, AuthController.me);
authRouter.get('/logins', requireJWT, AuthController.logins);
authRouter.post('/change-password', requireJWT, validateBody(changePasswordSchema), AuthController.changePassword);
authRouter.post('/2fa/setup', requireJWT, AuthController.setup2FA);
authRouter.post('/2fa/verify', requireJWT, validateBody(verify2FASchema), AuthController.verify2FA);
authRouter.post('/2fa/disable', requireJWT, AuthController.disable2FA);
authRouter.get('/sessions', requireJWT, AuthController.getSessions);
authRouter.delete('/sessions/:sessionId', requireJWT, AuthController.revokeSession);

