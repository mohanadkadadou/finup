import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { ApiError } from '../errors.js';

export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', r.error.flatten());
  }
  return r.data;
}

export const uid = (req: Request): string => {
  if (!req.userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in.');
  return req.userId;
};

export const idParam = (req: Request, name = 'id'): string => {
  const v = req.params[name];
  if (!v || !/^[0-9a-f-]{36}$/i.test(v)) throw new ApiError(404, 'NOT_FOUND', 'Not found.');
  return v;
};
