'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownUp, ChevronLeft, ChevronRight, Inbox, MapPin, Search, ShieldAlert, X } from 'lucide-react';
import type { ComplaintGroupView } from '@/lib/types';
import { EmptyState, SlaChip, StatusBadge, TIER_LABEL, UrgencyPill, formatDate, humanize } from '@/components/ui';
import { EASE_OUT } from '@/components/motion';

export const HASHTAG_FILTERS = [
  '#BTech',
  '#technical',
  '#MCA',
  '#AppliedSciences',
  '#Infrastructure',
  '#ITSupport',
  '#Sanitation',
  '#LabDamage',
];

type SortKey = 'priority' | 'newest' | 'oldest' | 'deadline';
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'priority', label: 'Priority' },
  { key: 'deadline', label: 'Deadline soonest' },
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
];

const PAGE_SIZE = 10;

export default function ComplaintTable({
  rows,
  now,
  onOpen,
  zone,
  onClearZone,
  showSla = true,
  emptyTitle = 'No complaints here',
  emptyBody,
  searchRef,
}: {
  rows: ComplaintGroupView[];
  now: number;
  onOpen: (ticket: ComplaintGroupView, opener: HTMLElement | null) => void;
  zone?: string | null;
  onClearZone?: () => void;
  showSla?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  searchRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<SortKey>('priority');
  const [page, setPage] = useState(0);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const inputRef = searchRef ?? fallbackRef;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const t = tag.toLowerCase();
    const out = rows.filter((r) => {
      if (zone && r.location_zone !== zone) return false;
      if (t && !r.hashtags.some((h) => h.toLowerCase() === t)) return false;
      if (!q) return true;
      return [r.tracking_id, r.normalized_title, r.title, r.location_zone, r.category, ...r.hashtags]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    // "priority" keeps the server's queue order (score desc, then nearest deadline).
    if (sort === 'newest') out.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    if (sort === 'oldest') out.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    if (sort === 'deadline') out.sort((a, b) => Date.parse(a.stage_deadline) - Date.parse(b.stage_deadline));
    return out;
  }, [rows, query, tag, sort, zone]);

  useEffect(() => setPage(0), [query, tag, sort, zone, rows.length]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const filtering = !!(query || tag || zone);

  return (
    <div className="cs-card overflow-hidden">
      {/* Toolbar */}
      <div className="p-3 sm:p-4 border-b border-line flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" aria-hidden="true" />
          <label htmlFor="complaint-search" className="sr-only">
            Search complaints
          </label>
          <input
            id="complaint-search"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ID, issue, location or tag"
            className="cs-input h-10 pl-9"
          />
        </div>
        <div className="grid grid-cols-2 md:flex gap-2">
          <label className="sr-only" htmlFor="tag-filter">
            Filter by tag
          </label>
          <select id="tag-filter" value={tag} onChange={(e) => setTag(e.target.value)} className="cs-input h-10 md:w-44">
            <option value="">All tags</option>
            {HASHTAG_FILTERS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <div className="relative">
            <ArrowDownUp className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" aria-hidden="true" />
            <label className="sr-only" htmlFor="sort">
              Sort by
            </label>
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="cs-input h-10 pl-9 md:w-48">
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {zone && (
        <div className="px-4 py-2.5 border-b border-line flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Zone:</span>
          <span className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-lg border border-line bg-white/[0.04]">
            {zone}
            <button type="button" onClick={onClearZone} aria-label="Clear zone filter" className="w-5 h-5 rounded-md inline-flex items-center justify-center hover:bg-white/10">
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </span>
        </div>
      )}

      {slice.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filtering && rows.length ? 'No matches' : emptyTitle}
          body={filtering && rows.length ? 'Try a different search or clear the filters.' : emptyBody}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-subtle border-b border-line">
                  <th scope="col" className="font-medium px-4 py-3">ID</th>
                  <th scope="col" className="font-medium px-4 py-3">Issue</th>
                  <th scope="col" className="font-medium px-4 py-3 hidden 2xl:table-cell">Location</th>
                  <th scope="col" className="font-medium px-4 py-3 hidden lg:table-cell">Submitted</th>
                  <th scope="col" className="font-medium px-4 py-3">Priority</th>
                  <th scope="col" className="font-medium px-4 py-3 hidden lg:table-cell">Assigned</th>
                  <th scope="col" className="font-medium px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
                <motion.tbody key={`${current}-${sort}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                  {slice.map((r) => (
                    <tr
                      key={r.tracking_id}
                      onClick={(e) => onOpen(r, e.currentTarget.querySelector('button'))}
                      className="group border-b border-line last:border-0 cursor-pointer transition-colors hover:bg-white/[0.025]"
                    >
                      <td className="px-4 py-3.5 font-mono text-xs text-fg-muted whitespace-nowrap">{r.tracking_id}</td>
                      <td className="px-4 py-3.5 max-w-[22rem]">
                        <span className="flex items-center gap-1.5">
                          {r.is_safety_critical && <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-bad" aria-label="Safety-critical" />}
                          <span className="font-medium truncate">{r.normalized_title || r.title}</span>
                        </span>
                        <span className="block text-xs text-fg-subtle truncate">
                          {humanize(r.category)}
                          <span className="2xl:hidden"> · {r.location_zone}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-fg-muted hidden 2xl:table-cell max-w-[14rem] truncate">{r.location_zone}</td>
                      <td className="px-4 py-3.5 text-fg-muted whitespace-nowrap hidden lg:table-cell">{formatDate(r.created_at, false)}</td>
                      <td className="px-4 py-3.5">
                        <UrgencyPill
                          priority={r.priority}
                          score={r.priority_score}
                          pulse={r.is_safety_critical && (r.status === 'UNACKNOWLEDGED' || r.status === 'ESCALATED')}
                        />
                      </td>
                      <td className="px-4 py-3.5 text-fg-muted whitespace-nowrap hidden lg:table-cell">
                        {TIER_LABEL[r.current_handler_role] ?? r.current_handler_role}
                        <span className="text-fg-subtle"> · {r.primary_department_code}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={r.status} />
                          {showSla && r.status !== 'RESOLVED' && <SlaChip deadline={r.stage_deadline} now={now} />}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(r, e.currentTarget);
                          }}
                          className="btn-secondary h-8 px-3 text-xs"
                          aria-label={`Open complaint ${r.tracking_id}`}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </motion.tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-line">
            {slice.map((r, i) => (
              <motion.li
                key={r.tracking_id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.03, ease: EASE_OUT }}
              >
                <button type="button" onClick={(e) => onOpen(r, e.currentTarget)} className="w-full text-left p-4 active:bg-white/[0.03]">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-fg-subtle">{r.tracking_id}</span>
                    <StatusBadge status={r.status} />
                  </span>
                  <span className="mt-2 block font-medium leading-snug">{r.normalized_title || r.title}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
                    <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{r.location_zone}</span>
                  </span>
                  <span className="mt-3 flex flex-wrap items-center gap-1.5">
                    <UrgencyPill priority={r.priority} score={r.priority_score} />
                    {showSla && r.status !== 'RESOLVED' && <SlaChip deadline={r.stage_deadline} now={now} />}
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        </>
      )}

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="px-4 py-3 border-t border-line flex items-center justify-between gap-3 text-sm text-fg-muted">
          <span className="tabular-nums">
            {current * PAGE_SIZE + 1}–{Math.min(filtered.length, (current + 1) * PAGE_SIZE)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              className="btn-icon w-9 h-9 disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="px-2 tabular-nums">
              {current + 1} / {pages}
            </span>
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current >= pages - 1}
              className="btn-icon w-9 h-9 disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
