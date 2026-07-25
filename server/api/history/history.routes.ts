import { Router } from 'express';
import { HistoryController } from './history.controller';
import { InterviewController } from '../interview/interview.controller';
import { uploadResumeFile } from '../../middleware/upload';
import { requireJWT } from '../../middleware/jwt.middleware';

export const historyRouter = Router();

historyRouter.use(requireJWT);

historyRouter.get('/resumes', HistoryController.getResumes);
historyRouter.put('/resumes/:id', uploadResumeFile.single('file'), InterviewController.updateResume);
historyRouter.delete('/resumes/:id', HistoryController.deleteResume);
historyRouter.get('/job-descriptions', HistoryController.getJobDescriptions);
