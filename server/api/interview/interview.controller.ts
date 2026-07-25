import { Request, Response } from 'express';
import { InterviewService } from './interview.service';
import { BadRequestError, NotFoundError, catchAsync } from '../../middleware/error_handling';
import path from 'path';
import { createRequire } from 'module';
import {
  UploadResumeDto,
  UploadJobDescriptionDto,
  GenerateQuestionsDto,
  EvaluateDto,
  UpdateResumeDto,
} from '../../dtos/interview.dto';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

async function extractTextFromBuffer(buffer: Buffer, mimetype: string, filename: string): Promise<string> {
  if (mimetype.includes('text') || filename.toLowerCase().endsWith('.txt')) {
    return buffer.toString('utf-8');
  }

  if (mimetype.includes('pdf') || filename.toLowerCase().endsWith('.pdf')) {
    try {
      const parsed = await pdf(buffer);
      if (parsed && parsed.text && parsed.text.trim().length > 10) {
        return parsed.text;
      }
    } catch (err) {
      console.error('🔮 [PDF Extraction] pdf-parse failed, falling back to basic extraction:', err);
    }
  }

  const raw = buffer.toString('binary');
  const matches = raw.match(/[\x20-\x7E\t\r\n]{4,}/g) || [];
  const cleaned = matches
    .map(m => m.trim())
    .filter(m => m.length > 3 && !m.startsWith('%PDF') && !m.includes('Font') && !m.includes('Obj'))
    .join('\n');

  if (cleaned.trim().length > 30) {
    return cleaned;
  }

  return `[File Resume: ${filename}]\nUploaded File: ${filename} (${Math.round(buffer.length / 1024)} KB)`;
}

export class InterviewController {
  static uploadResume = catchAsync(async (req: Request<any, any, UploadResumeDto>, res: Response): Promise<void> => {
    const { text, title, fileType } = req.body;
    const data = await InterviewService.uploadResume(text, title, fileType, undefined, req.user);
    res.json({ success: true, data });
  });

  static uploadResumeFile = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) {
      throw new BadRequestError('No file uploaded or file exceeds 8MB size limit');
    }

    const title = req.body.title || file.originalname.replace(/\.[^/.]+$/, '');
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const fileType = (ext === 'pdf' ? 'pdf' : ext === 'docx' || ext === 'doc' ? 'docx' : 'text') as any;

    const extractedText = await extractTextFromBuffer(file.buffer, file.mimetype, file.originalname);

    const data = await InterviewService.uploadResume(
      extractedText,
      title,
      fileType,
      {
        fileName: file.originalname,
        fileSize: file.size,
        fileUrl: undefined // Can be used if Supabase Storage is configured
      },
      req.user
    );

    res.json({ success: true, data });
  });

  static updateResume = catchAsync(async (req: Request<any, any, UpdateResumeDto>, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!id) {
      throw new BadRequestError('Resume ID parameter is required');
    }

    let payload: {
      title?: string;
      text?: string;
      fileType?: string;
      fileName?: string;
      fileSize?: number;
      fileUrl?: string;
    } = {};

    if (req.file) {
      const file = req.file;
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
      const fileType = (ext === 'pdf' ? 'pdf' : ext === 'docx' || ext === 'doc' ? 'docx' : 'text');
      const extractedText = await extractTextFromBuffer(file.buffer, file.mimetype, file.originalname);

      payload = {
        title: req.body.title || file.originalname.replace(/\.[^/.]+$/, ''),
        text: extractedText,
        fileType,
        fileName: file.originalname,
        fileSize: file.size
      };
    } else {
      const { title, text, fileType } = req.body;
      payload = { title, text, fileType };
    }

    const data = await InterviewService.updateResume(id, payload, req.user);
    res.json({ success: true, data });
  });

  static uploadJobDescription = catchAsync(async (req: Request<any, any, UploadJobDescriptionDto>, res: Response): Promise<void> => {
    const { text } = req.body;
    const data = await InterviewService.uploadJobDescription(text, req.user);
    res.json({ success: true, data });
  });

  static generateQuestions = catchAsync(async (req: Request<any, any, GenerateQuestionsDto>, res: Response): Promise<void> => {
    const data = await InterviewService.generateQuestions(req.body, req.user);
    res.json({ success: true, data });
  });

  static evaluate = catchAsync(async (req: Request<any, any, EvaluateDto>, res: Response): Promise<void> => {
    const { sessionId, questionId, answerText } = req.body;
    const data = await InterviewService.evaluate(sessionId, questionId, answerText, req.user);
    res.json({ success: true, data });
  });

  static getHistory = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const data = await InterviewService.getHistory(req.user);
    res.json({ success: true, data });
  });

  static getSession = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const data = await InterviewService.getSessionById(id);
    if (!data) {
      throw new NotFoundError(`Interview session with ID '${id}' not found`);
    }
    res.json({ success: true, data });
  });
}
