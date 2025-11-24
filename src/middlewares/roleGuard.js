// middlewares/roleGuard.js
import { errorResponse } from "../utils/response.js";
import Post from "../models/Post.js";

export const adminOnly = (req, res, next) => {
  if (!req.user?.isAdmin)
    return errorResponse(res, "Only administrators can access this", 403);
  next();
};

export const ownerOrAdmin = async (req, res, next) => {
  const post = await Post.findById(req.params.id);
  if (!post) return errorResponse(res, "Post not found", 404);

  const userId = req.user?.id?.toString();
  if (req.user?.isAdmin || post.author.toString() === userId) {
    req.post = post;
    return next();
  }

  return errorResponse(res, "Access denied", 403);
};
