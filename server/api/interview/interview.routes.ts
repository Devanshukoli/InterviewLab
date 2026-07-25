import { Router } from 'express';
import { InterviewController } from './interview.controller';
import { uploadResumeFile } from '../../middleware/upload';
import { requireJWT } from '../../middleware/jwt.middleware';

export const interviewRouter = Router();

interviewRouter.use(requireJWT);

interviewRouter.post('/upload-resume', InterviewController.uploadResume);
interviewRouter.post('/upload-resume-file', uploadResumeFile.single('file'), InterviewController.uploadResumeFile);
interviewRouter.put('/resume/:id', uploadResumeFile.single('file'), InterviewController.updateResume);
interviewRouter.post('/upload-job-description', InterviewController.uploadJobDescription);
interviewRouter.post('/generate-questions', InterviewController.generateQuestions);
interviewRouter.post('/evaluate', InterviewController.evaluate);
interviewRouter.get('/history', InterviewController.getHistory);
interviewRouter.get('/session/:id', InterviewController.getSession);
