import type { NextFunction, Request, Response } from "express";

export class ApiError extends Error {
  status: number;
  errorCode: string;

  constructor(status: number, errorCode: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export const errorHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) => {
  if (error instanceof ApiError) {
    response.status(error.status).json({
      detail: {
        error_code: error.errorCode,
        message: error.message,
      },
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected server error.";
  response.status(500).json({
    detail: {
      error_code: "E500",
      message,
    },
  });
};
