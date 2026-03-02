import 'express';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        type: 'session' | 'api_key';
        keyId?: string;
        permissions: string[];
      };
    }
  }
}
