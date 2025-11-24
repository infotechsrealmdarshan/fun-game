    // utils/response.js

    /**
     * ✅ Success Response
     */
    export const successResponse = (
    res,
    message,
    data = null,
    pagination = null,
    statusCode = 200,
    status = 1
    ) => {
    const response = { statusCode, status, message };

    if (data !== null) response.data = data;

    if (pagination) {
        response.currentPage = pagination.currentPage || pagination.page || 1;
        response.perPage = pagination.itemsPerPage || pagination.limit || 10;
        response.totalPage =
        pagination.totalPages ||
        Math.ceil(
            (pagination.totalItems || 0) /
            (pagination.itemsPerPage || pagination.limit || 10)
        );
        response.totalData = pagination.totalItems || 0;
    }

    return res.status(statusCode).json(response);
    };

    /**
     * ❌ Error Response
     */
    export const errorResponse = (res, message, code = 404) => {
    return res.status(code).json({
        statusCode: code,
        message,
    });
    };
