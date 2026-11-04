import type { Request, RequestHandler, Response } from 'express';

type AsyncRoute = (
  request: Request,
  response: Response,
  next: Parameters<RequestHandler>[2]
) => Promise<unknown>;

export function asyncHandler(handler: AsyncRoute): RequestHandler {
  return (request, response, next) => {
    void handler(request, response, next).catch(next);
  };
}
