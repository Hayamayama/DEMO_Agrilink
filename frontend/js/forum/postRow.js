import { el, isCompact } from '../dom.js';
import { SORT_LABEL, tagLabel, relTime, replies, scoreText } from './forumUtils.js';

// One feed row: score, state marks, title (2 lines / 1 on the small screen),
// then community · tag · region · replies · time. Never the body.
export function postRow(p, { showRegion = false } = {}) {
  const row = el('item forum-post-row');
  row.dataset.postId = p.id;
  row.appendChild(el('forum-score', scoreText(p.score)));

  const main = el('forum-main');
  const title = el('forum-title');
  const marks = [p.isPinned && 'PIN', p.isSolved && '✓', p.isLocked && 'LOCK'].filter(Boolean);
  if (marks.length) title.appendChild(el('forum-state', marks.join(' '), 'span'));
  title.appendChild(document.createTextNode(p.title));
  main.appendChild(title);

  const bits = [p.community.name];
  if (p.author?.isVerifiedExpert) bits.push(`✓ ${p.author.expertTitle || 'Verified expert'}`);
  else if (String(p.title).startsWith('[GOV]')) bits.push('📌 Official');
  const tag = p.tags.find((t) => t !== p.community.slug);
  if (tag) bits.push(tagLabel(tag));
  if (showRegion) bits.push(p.locationLabel);
  bits.push(replies(p.replyCount));
  const compact = isCompact();
  if (!compact) bits.push(relTime(p.lastActivityAt));
  main.appendChild(el('forum-meta', bits.join(' · ')));
  row.appendChild(main);
  return row;
}

export function sortTabs(active) {
  const tabs = el('forum-sort-tabs');
  for (const key of ['local', 'new', 'top']) {
    const t = el(key === active ? 'forum-tab on' : 'forum-tab', key === active ? `[${SORT_LABEL[key]}]` : SORT_LABEL[key], 'span');
    if (key === active) t.setAttribute('aria-current', 'true');
    tabs.appendChild(t);
  }
  return tabs;
}
