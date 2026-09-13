import type { NextFunction, Request, Response } from "express";

export class ApiError extends Error {
  status: number;
  errorCode: string;
  elementId?: string;
  attribute?: string;

  constructor(
    status: number,
    errorCode: string,
    message: string,
    elementId?: string,
    attribute?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorCode = errorCode;
    this.elementId = elementId;
    this.attribute = attribute;
  }
}

export const errorHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) => {
  if (error instanceof ApiError) {
    const detail: Record<string, unknown> = {
      error_code: error.errorCode,
      message: error.message,
    };
    if (error.elementId) detail.element_id = error.elementId;
    if (error.attribute) detail.attribute = error.attribute;
    response.status(error.status).json({ detail });
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
