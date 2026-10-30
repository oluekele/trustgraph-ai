import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  detail?: unknown;
  path: string;
  timestamp: string;
}

/** Uniform JSON error responses; never leaks stack traces or internal error messages. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const body: ErrorBody = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof HttpException) {
      body.statusCode = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        body.message = payload;
        body.error = exception.name;
      } else if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        body.message = (record.message as string | string[] | undefined) ?? exception.message;
        body.error = typeof record.error === 'string' ? record.error : exception.name;
        if (record.detail !== undefined) body.detail = record.detail;
      }
      if (body.statusCode >= 500) {
        this.logger.warn(`${request.method} ${body.path} -> ${body.statusCode}: ${String(body.message)}`);
      }
    } else {
      const error = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(`${request.method} ${body.path} failed: ${error.message}`, error.stack);
    }

    if (!response.headersSent) {
      response.status(body.statusCode).json(body);
    }
  }
}
