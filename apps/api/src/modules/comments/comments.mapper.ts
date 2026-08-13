// Comment -> API response mappers — COMM-001 (PC-03).
//
// The single place where Prisma Comment rows become the API contract: the raw
// authorId FK becomes the resolved `author` { id, name } ref. Every response
// path MUST go through here — never the raw Prisma model.
import type { Comment } from '../../generated/prisma/client'
import type { CommentResponse, TaskComment } from './dto/comment-response.dto'

export interface UserRefShape {
  id: string
  name: string
}

export type CommentWithAuthor = Comment & { author: UserRefShape }

export function toCommentResponse(comment: CommentWithAuthor): CommentResponse {
  return {
    id: comment.id,
    taskId: comment.taskId,
    content: comment.content,
    author: comment.author,
    createdAt: comment.createdAt,
  }
}

/** Compact shape embedded in the task detail (COMM-001: last 5 comments). */
export function toTaskComment(comment: CommentWithAuthor): TaskComment {
  return {
    id: comment.id,
    content: comment.content,
    author: comment.author,
    createdAt: comment.createdAt,
  }
}
