'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, homePathForRole } from '@/lib/auth-context';
import { SummaryLines, TIER_LABEL, UrgencyPill } from '@/components/ui';
import {
  Upload,
  FileText,
  X,
  Copy,
  Check,
  ArrowRight,
  Clock,
  Building,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

const ACADEMIC_LOCATION_PRESETS = [
  'B.Tech Block - CSE Lab 3',
  'B.Tech Block - ECE Hardware Lab',
  'MCA Block - Seminar Hall',
  'Applied Sciences - Chemistry Lab 1',
  'Applied Sciences - Physics Lab 2',
  'Civil Engineering - Materials Workshop',
  'Central IT Wing - Server & Coding Lab',
  'Academic Block 2 - Lecture Hall 204',
];

const MB = 1024 * 1024;
const RAW_TEXT_MIN = 15;
const RAW_TEXT_MAX = 2000;
const TIER1_WINDOW_MS = 72 * 60 * 60 * 1000;

// Must mirror the server allowlist in /api/complaints/upload.
const ATTACHMENT_RULES: { mime: string; ext: string[]; kind: 'image' | 'document'; maxBytes: number }[] = [
  { mime: 'image/jpeg', ext: ['jpg', 'jpeg'], kind: 'image', maxBytes: 8 * MB },
  { mime: 'image/png', ext: ['png'], kind: 'image', maxBytes: 8 * MB },
  { mime: 'image/webp', ext: ['webp'], kind: 'image', maxBytes: 8 * MB },
  { mime: 'application/pdf', ext: ['pdf'], kind: 'document', maxBytes: 10 * MB },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: ['docx'],
    kind: 'document',
    maxBytes: 10 * MB,
  },
  { mime: 'text/plain', ext: ['txt'], kind: 'document', maxBytes: 10 * MB },
];

function validateAttachment(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const rule =
    ATTACHMENT_RULES.find((r) => r.mime === file.type) ??
    (!file.type || file.type === 'application/octet-stream'
      ? ATTACHMENT_RULES.find((r) => r.ext.includes(ext))
      : undefined);
  if (!rule) return 'Unsupported file type. Use a JPEG, PNG or WebP image, or a PDF, DOCX or TXT document.';
  if (file.size === 0) return 'The selected file is empty.';
  if (file.size > rule.maxBytes) {
    return rule.kind === 'image' ? 'Images must be 8 MB or smaller.' : 'Documents must be 10 MB or smaller.';
  }
  return null;
}

/** Defensive shape of the submit response's `group` (store-agent owns the real type). */
interface ReceiptGroup {
  tracking_id?: string;
  normalized_title?: string;
  ai_summary?: string;
  priority?: string;
  priority_score?: number;
  hashtags?: string[];
  current_handler_role?: string;
  stage_deadline?: string;
  status?: string;
  location_zone?: string;
}

interface Receipt {
  tracking_id: string;
  receipt_id: string;
  group: ReceiptGroup;
  deadline: number;
}

type Phase = 'idle' | 'uploading' | 'submitting';

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Moving up to Faculty';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, '0')}m left`;
}

function Countdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-mono tabular-nums" aria-label="Time remaining before auto-escalation">
      {formatRemaining(deadline - now)}
    </span>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the ID is still visible on screen */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${label}: ${value}`}
      className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-medium flex items-center gap-1.5 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}

export default function StudentSubmitPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  // Form State
  const [rawText, setRawText] = useState('');
  const [locationZone, setLocationZone] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  // Submission / Loading State
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Which field the current error belongs to: it gets aria-invalid and focus.
  const [errorField, setErrorField] = useState<'rawText' | 'locationZone' | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const submitting = phase !== 'idle';

  // Spec 01 §5: no guest submissions — unauthenticated users go to /login.
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Release object URLs for image previews.
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const problem = validateAttachment(file);
    if (problem) {
      setErrorMsg(problem);
      return;
    }
    setErrorMsg(null);
    setSelectedFile(file);
    setFilePreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setFilePreviewUrl(null);
  };

  const resetForm = () => {
    setReceipt(null);
    setRawText('');
    setLocationZone('');
    removeFile();
    setStatusMsg('');
    setErrorMsg(null);
  };

  const fail = (msg: string, field: 'rawText' | 'locationZone' | null = null) => {
    setErrorMsg(msg);
    setErrorField(field);
    setStatusMsg('');
    if (field) requestAnimationFrame(() => document.getElementById(field)?.focus());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setErrorField(null);

    const text = rawText.trim();
    if (text.length < RAW_TEXT_MIN) {
      return fail(`Describe the problem in a little more detail (at least ${RAW_TEXT_MIN} characters).`, 'rawText');
    }
    if (text.length > RAW_TEXT_MAX) {
      return fail(`The description is too long (maximum ${RAW_TEXT_MAX} characters).`, 'rawText');
    }
    if (!locationZone.trim()) {
      return fail('Choose where it is: tap a room below or type the building and room.', 'locationZone');
    }
    if (selectedFile) {
      const problem = validateAttachment(selectedFile);
      if (problem) return fail(problem);
    }

    try {
      // 1. Upload the attachment first (server stores it under a UUID name).
      let imageUrl: string | null = null;
      let documentUrl: string | null = null;
      let attachmentName: string | null = null;

      if (selectedFile) {
        setPhase('uploading');
        setStatusMsg('Uploading attachment...');
        const fd = new FormData();
        fd.append('file', selectedFile);
        const up = await fetch('/api/complaints/upload', {
          method: 'POST',
          body: fd,
          credentials: 'same-origin',
        });
        const upData = await up.json().catch(() => ({}));
        if (up.status === 401) {
          router.replace('/login');
          return;
        }
        if (!up.ok || typeof upData.url !== 'string') {
          throw new Error(upData.error || 'Attachment upload failed. Please retry.');
        }
        if (upData.kind === 'image') imageUrl = upData.url;
        else documentUrl = upData.url;
        attachmentName = typeof upData.attachmentName === 'string' ? upData.attachmentName : null;
      }

      // 2. Submit the complaint. The student is taken from the session server-side.
      setPhase('submitting');
      setStatusMsg('Submitting report and running AI triage...');
      const res = await fetch('/api/complaints/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          rawText: text,
          locationZone: locationZone.trim(),
          imageUrl,
          documentUrl,
          attachmentName,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      if (!res.ok || !data.success || !data.tracking_id) {
        throw new Error(data.error || 'Failed to submit complaint. Please retry.');
      }

      const group: ReceiptGroup = data.group && typeof data.group === 'object' ? data.group : {};
      const parsedDeadline = group.stage_deadline ? Date.parse(group.stage_deadline) : NaN;

      setReceipt({
        tracking_id: String(data.tracking_id),
        receipt_id: data.receipt_id ? String(data.receipt_id) : '',
        group,
        deadline: Number.isFinite(parsedDeadline) ? parsedDeadline : Date.now() + TIER1_WINDOW_MS,
      });
      setStatusMsg(`Report filed. Ticket ${data.tracking_id}.`);
    } catch (err: unknown) {
      fail(err instanceof Error ? err.message : 'An error occurred during submission.');
    } finally {
      setPhase('idle');
    }
  };

  const liveRegion = (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {statusMsg}
    </div>
  );

  // Session check in progress, or redirecting to /login.
  if (loading || !user) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6">
        <div
          className="cs-card p-8 flex items-center gap-3 text-sm text-slate-400"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" aria-hidden="true" />
          <span>{loading ? 'Checking your session...' : 'Redirecting to sign in...'}</span>
        </div>
      </div>
    );
  }

  // Only students may file complaints (the upload/submit APIs enforce this too).
  if (user.role !== 'STUDENT') {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6">
        <div className="cs-card p-8 space-y-4">
          <div className="flex items-center gap-2 text-slate-100 font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <span>Complaint submission is available to student accounts only.</span>
          </div>
          <Link
            href={homePathForRole(user.role)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-100 text-slate-950 text-xs font-semibold uppercase tracking-wider hover:bg-white"
          >
            <span>Go to your dashboard</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  const group = receipt?.group;
  const priority = group?.priority || 'PENDING';
  const handler = group?.current_handler_role || 'TEACHER';
  const hashtags = Array.isArray(group?.hashtags) ? group!.hashtags : [];

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6">
      {liveRegion}
      {!receipt ? (
        /* Submission Intake Form */
        <div className="cs-card p-8 sm:p-10 relative space-y-6">
          {/* Session Notice */}

          {/* Header */}
          <div className="border-b border-slate-800 pb-4">
            <h1 className="font-serif text-3xl font-normal text-slate-100 tracking-tight">
              Report an Equipment or Facility Issue
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Submit details of broken laboratory apparatus, electrical hazards, or infrastructure defects.
            </p>
          </div>

          <div className="cs-inset p-3.5 text-slate-200 text-sm flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" aria-hidden="true" />
            <p>
              <strong className="font-semibold text-slate-100">Staff never see your name or email.</strong> They only see a ticket
              number. You can follow this report later in My Reports.
            </p>
          </div>

          <p className="alert-warn text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
            <span>
              If anyone is in danger right now (sparks, smoke, a loose fixture), leave the area and tell lab staff or campus
              security first. Then report it here.
            </span>
          </p>

          {/* Error Message */}
          {errorMsg && (
            <div id="form-error" role="alert" className="alert-error text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-red-300 shrink-0" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" aria-busy={submitting} noValidate>
            {/* Location Zone */}
            <div>
              <label
                htmlFor="locationZone"
                className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5"
              >
                <Building className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                <span>Building & Room Location *</span>
              </label>

              {/* Quick Preset Pills */}
              <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Quick location presets">
                {ACADEMIC_LOCATION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={locationZone === preset}
                    onClick={() => setLocationZone(preset)}
                    className={`px-3 py-1 text-xs rounded-full transition-all ${
                      locationZone === preset
                        ? 'bg-slate-100 text-slate-950 font-bold shadow-sm'
                        : 'bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-600 hover:bg-slate-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <input
                id="locationZone"
                name="locationZone"
                type="text"
                required
                aria-required="true"
                suppressHydrationWarning
                value={locationZone}
                onChange={(e) => setLocationZone(e.target.value)}
                placeholder="Or type a building and room"
                aria-invalid={errorField === 'locationZone' ? true : undefined}
                aria-describedby={errorField === 'locationZone' ? 'locationZone-hint form-error' : 'locationZone-hint'}
                className="cs-input"
              />
              <p id="locationZone-hint" className="mt-1.5 text-xs text-slate-400">
                For example: B.Tech Block - Fluid Mechanics Lab, Room 102.
              </p>
            </div>

            {/* Problem Description */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
                <label htmlFor="rawText" className="block text-xs font-semibold text-slate-300">
                  Description of Issue *
                </label>
                <span
                  id="rawText-count"
                  className={`text-xs font-mono ${
                    rawText.length > RAW_TEXT_MAX
                      ? 'text-red-300 font-semibold'
                      : rawText.trim().length >= RAW_TEXT_MIN
                      ? 'text-emerald-400 font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  {rawText.length} / {RAW_TEXT_MAX} characters
                </span>
              </div>

              <textarea
                id="rawText"
                name="rawText"
                required
                aria-required="true"
                aria-describedby={errorField === 'rawText' ? 'rawText-count form-error' : 'rawText-count'}
                aria-invalid={errorField === 'rawText' ? true : undefined}
                rows={5}
                maxLength={RAW_TEXT_MAX}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="What is broken, and is anyone at risk?"
                className="cs-input py-3 leading-relaxed"
              ></textarea>
            </div>

            {/* Supporting Attachment */}
            <div>
              <span
                id="attachment-label"
                className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                <span>Supporting Photo or Document (Optional)</span>
              </span>

              {!selectedFile ? (
                <label
                  htmlFor="attachment"
                  className="border border-dashed border-slate-600 hover:border-slate-400 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/40 p-6 rounded-2xl flex flex-col items-center justify-center cursor-pointer bg-slate-950/60 hover:bg-slate-800 transition-all"
                >
                  <Upload className="w-6 h-6 text-slate-400 mb-2" aria-hidden="true" />
                  <span className="text-xs font-medium text-slate-300">
                    Click to attach photo of defect or maintenance log
                  </span>
                  <span id="attachment-hint" className="text-xs text-slate-400 mt-1">
                    JPEG, PNG or WebP images up to 8 MB; PDF, DOCX or TXT documents up to 10 MB
                  </span>
                  <input
                    id="attachment"
                    name="file"
                    type="file"
                    aria-labelledby="attachment-label"
                    aria-describedby="attachment-hint"
                    accept="image/jpeg,image/png,image/webp,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
              ) : (
                <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {filePreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={filePreviewUrl}
                        alt="Preview of the attached image"
                        className="w-10 h-10 rounded-lg object-cover border border-slate-800"
                      />
                    ) : (
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-100 truncate">{selectedFile.name}</div>
                      <div className="text-xs text-slate-400">
                        {(selectedFile.size / 1024).toFixed(1)} KB attached (stored under a random ID)
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    disabled={submitting}
                    className="p-2 rounded-full text-slate-400 hover:text-red-300 hover:bg-slate-800 transition-colors disabled:text-slate-600 disabled:cursor-not-allowed"
                    aria-label={`Remove attachment ${selectedFile.name}`}
                    title="Remove"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-3.5 px-8 gap-2.5"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                <span>
                  {phase === 'uploading'
                    ? 'Uploading attachment...'
                    : phase === 'submitting'
                    ? 'Running triage...'
                    : 'Submit & Speedrun Triage'}
                </span>
                {!submitting && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Receipt Card (spec 02 §4) */
        <section
          aria-labelledby="receipt-heading"
          className="cs-card p-8 sm:p-10 space-y-6"
        >
          <div className="p-6 rounded-2xl bg-slate-950 border border-slate-700 text-white space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <span className="text-xs text-slate-300 uppercase tracking-wider block">
                  Report Filed Successfully
                </span>
                <h2 id="receipt-heading" className="text-2xl font-bold font-mono tracking-tight text-white">
                  Ticket #{receipt.tracking_id}
                </h2>
              </div>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-slate-400">Tracking ID</dt>
                  <dd className="font-mono text-sm font-semibold">{receipt.tracking_id}</dd>
                </div>
                <CopyButton value={receipt.tracking_id} label="Copy ID" />
              </div>
              {receipt.receipt_id && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5">
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-slate-400">Your Receipt ID</dt>
                    <dd className="font-mono text-sm font-semibold">{receipt.receipt_id}</dd>
                  </div>
                  <CopyButton value={receipt.receipt_id} label="Copy Receipt" />
                </div>
              )}
            </dl>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800 text-emerald-100 text-xs flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>
              Staff see this report only as an anonymous ticket. Either ID above opens its live status on the tracking page.
            </span>
          </div>

          {/* Issue Summary */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  AI Summary
                </span>
                <span className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <span className="sr-only">Detected urgency:</span>
                  <UrgencyPill
                    calm
                    priority={priority}
                    score={typeof group?.priority_score === 'number' ? group.priority_score : null}
                  />
                </span>
              </div>

              {group?.normalized_title && (
                <h3 className="font-serif text-xl font-medium text-slate-100">{group.normalized_title}</h3>
              )}
              {group?.ai_summary ? (
                <SummaryLines summary={group.ai_summary} />
              ) : (
                <p className="text-sm text-slate-400">Summary is being generated.</p>
              )}
              {group?.location_zone && (
                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Building className="w-3 h-3" aria-hidden="true" />
                  {group.location_zone}
                </p>
              )}

              {hashtags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-slate-700">
                  <span className="text-xs text-slate-400 uppercase mr-1">Tags:</span>
                  <ul className="flex flex-wrap gap-1.5" aria-label="Assigned hashtags">
                    {hashtags.map((tag) => (
                      <li key={tag} className="hashtag-pill">
                        {tag}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Escalation Status */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-slate-400" aria-hidden="true" />
                <div>
                  <div className="font-semibold text-slate-100">With: Tier 1 · {TIER_LABEL[handler] ?? handler}</div>
                  <div className="text-xs text-slate-400">
                    If it isn&apos;t handled within 72 hours, it moves up to Faculty automatically.
                  </div>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium">
                <Countdown deadline={receipt.deadline} />
              </span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => router.push(`/track?id=${encodeURIComponent(receipt.tracking_id)}`)}
              className="btn-primary w-full sm:flex-1 py-3.5 px-6"
            >
              <span>Track Complaint Live</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="btn-secondary w-full sm:w-auto py-3.5 px-6 uppercase tracking-wider"
            >
              Submit Another Report
            </button>
          </div>
          <p className="text-center text-xs text-slate-400">
            All your reports, ranked by priority, are on{' '}
            <Link href="/dashboard" className="text-slate-200 underline underline-offset-2 hover:text-white">
              My Reports
            </Link>
            .
          </p>
        </section>
      )}
    </div>
  );
}
