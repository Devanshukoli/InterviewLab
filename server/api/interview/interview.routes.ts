import { Router } from 'express';
import { InterviewController } from './interview.controller';
import { uploadResumeFile } from '../../middleware/upload';
import { requireJWT } from '../../middleware/jwt.middleware';
import { validateBody } from '../../middleware/validation';
import {
  uploadResumeSchema,
  uploadJobDescriptionSchema,
  generateQuestionsSchema,
  evaluateSchema,
  updateResumeSchema,
} from './interview.schema';

export const interviewRouter = Router();

interviewRouter.use(requireJWT);

interviewRouter.post('/upload-resume', validateBody(uploadResumeSchema), InterviewController.uploadResume);
interviewRouter.post('/upload-resume-file', uploadResumeFile.single('file'), InterviewController.uploadResumeFile);
interviewRouter.put('/resume/:id', uploadResumeFile.single('file'), validateBody(updateResumeSchema), InterviewController.updateResume);
interviewRouter.post('/upload-job-description', validateBody(uploadJobDescriptionSchema), InterviewController.uploadJobDescription);
interviewRouter.post('/generate-questions', validateBody(generateQuestionsSchema), InterviewController.generateQuestions);
interviewRouter.post('/evaluate', validateBody(evaluateSchema), InterviewController.evaluate);
interviewRouter.get('/history', InterviewController.getHistory);
interviewRouter.get('/session/:id', InterviewController.getSession);

