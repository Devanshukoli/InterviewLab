import { Request, Response } from 'express';
import { ByokService } from './byok.service';
import { catchAsync, BadRequestError } from '../../middleware/error_handling';
import { Provider, validateApiKeyAndGetModels } from '../../services/model-registry';

export class ByokController {
  static getKeys = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || 'usr-anonymous';
    const keys = await ByokService.getUserKeys(userId);
    const mapped = keys.map((k, i) => ({
      ...k,
      keyHint: `••••••••${k.keyLastFour}`,
      isValidated: k.isValid,
      isPrimary: i === 0
    }));
    res.json({ success: true, data: mapped });
  });

  static getStatus = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || 'usr-anonymous';
    const hasValidKey = await ByokService.hasValidKey(userId);
    res.json({ success: true, data: { hasValidKey } });
  });

  static saveKey = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || 'usr-anonymous';
    const { provider, apiKey, preferredModel } = req.body;

    if (!provider || !['openai', 'anthropic', 'gemini'].includes(provider)) {
      throw new BadRequestError('Invalid provider. Must be openai, anthropic, or gemini');
    }
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new BadRequestError('API key string is required');
    }

    const result = await ByokService.saveKey(userId, provider as Provider, apiKey, preferredModel);
    res.json({ success: true, data: result.key, availableModels: result.availableModels });
  });

  static validateKey = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || 'usr-anonymous';
    const keyIdentifier = req.params.keyIdentifier || req.params.id || req.params.provider;

    const record = await ByokService.getKeyByIdentifier(userId, keyIdentifier);
    if (!record) {
      throw new BadRequestError(`No API key found matching ${keyIdentifier}`);
    }

    const result = await ByokService.testConnection(userId, record.provider);
    if (!result.isValid) {
      res.status(422).json({
        success: false,
        message: result.error || `Key validation failed for ${record.provider.toUpperCase()}`
      });
      return;
    }

    res.json({
      success: true,
      data: {
        isValid: true,
        models: result.availableModels,
        availableModels: result.availableModels
      }
    });
  });

  static setPrimary = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || 'usr-anonymous';
    const keyIdentifier = req.params.keyIdentifier || req.params.id || req.params.provider;

    const record = await ByokService.getKeyByIdentifier(userId, keyIdentifier);
    if (!record) {
      throw new BadRequestError(`No API key found matching ${keyIdentifier}`);
    }

    res.json({ success: true, message: `Set ${record.provider.toUpperCase()} as primary key` });
  });

  static deleteKey = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || 'usr-anonymous';
    const keyIdentifier = req.params.keyIdentifier || req.params.provider || req.params.id;

    const record = await ByokService.getKeyByIdentifier(userId, keyIdentifier);
    if (!record) {
      throw new BadRequestError(`No API key found matching ${keyIdentifier}`);
    }

    await ByokService.deleteKey(userId, record.provider);
    res.json({ success: true, message: `Key for ${record.provider} deleted successfully` });
  });

  static testConnection = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || 'usr-anonymous';
    const { provider, apiKey } = req.body;

    if (!provider || !['openai', 'anthropic', 'gemini'].includes(provider)) {
      throw new BadRequestError('Invalid provider');
    }

    const result = await ByokService.testConnection(userId, provider as Provider, apiKey);
    res.json({ success: true, data: result });
  });

  static getModels = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || 'usr-anonymous';
    const { provider } = req.params;

    if (!provider || !['openai', 'anthropic', 'gemini'].includes(provider)) {
      throw new BadRequestError('Invalid provider');
    }

    const record = await ByokService.getKeyRecord(userId, provider as Provider);
    if (!record || !record.isValid) {
      throw new BadRequestError(`No valid API key found for ${provider}`);
    }

    const result = await ByokService.testConnection(userId, provider as Provider);
    res.json({ success: true, data: { availableModels: result.availableModels } });
  });

  static updatePreferredModel = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || 'usr-anonymous';
    const { provider } = req.params;
    const { model } = req.body;

    if (!provider || !['openai', 'anthropic', 'gemini'].includes(provider)) {
      throw new BadRequestError('Invalid provider');
    }
    if (!model || typeof model !== 'string') {
      throw new BadRequestError('Model name is required');
    }

    const updatedKey = await ByokService.updatePreferredModel(userId, provider as Provider, model);
    res.json({ success: true, data: updatedKey });
  });
}
