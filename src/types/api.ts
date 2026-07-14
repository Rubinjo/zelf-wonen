export type ApiError = {
    error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string[]>;
        requestId?: string;
    };
};

export type ApiSuccess<T> = {
    data: T;
};
