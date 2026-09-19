import { getApi, postApi, putJSON, deleteJSON } from '../api.js';

const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v != null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
const id = encodeURIComponent;

export const forumApi = {
  regions: () => getApi('/api/forum/regions'),
  communities: () => getApi('/api/forum/communities'),
  tags: (community) => getApi(`/api/forum/tags${qs({ community })}`),
  posts: (query) => getApi(`/api/forum/posts${qs(query)}`),
  post: (postId) => getApi(`/api/forum/posts/${id(postId)}`),
  createPost: (body) => postApi('/api/forum/posts', body, { timeout: 15000 }),
  createReply: (postId, body) => postApi(`/api/forum/posts/${id(postId)}/replies`, body, { timeout: 15000 }),
  vote: (targetType, targetId, value) => putJSON('/api/forum/votes', { targetType, targetId, value }),
  save: (postId) => putJSON(`/api/forum/posts/${id(postId)}/save`),
  unsave: (postId) => deleteJSON(`/api/forum/posts/${id(postId)}/save`),
  report: (targetType, targetId, reason, note) => postApi('/api/forum/reports', { targetType, targetId, reason, note }),
  setSolution: (postId, replyId) => putJSON(`/api/forum/posts/${id(postId)}/solution`, { replyId }),
  clearSolution: (postId) => deleteJSON(`/api/forum/posts/${id(postId)}/solution`),
  moderate: (postId, changes) => putJSON(`/api/forum/posts/${id(postId)}/moderation`, changes),
  myPosts: () => getApi('/api/forum/me/posts'),
  saved: () => getApi('/api/forum/me/saved'),
  notifications: () => getApi('/api/forum/me/notifications'),
  notificationsSeen: () => postApi('/api/forum/me/notifications/seen', {}),
};
