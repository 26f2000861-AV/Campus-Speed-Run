'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth, homePathForRole } from '@/lib/auth-context';
import { SummaryLines, TIER_LABEL, UrgencyPill } from '@/components/ui';
import { EASE_OUT } from '@/components/motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Copy,
  EyeOff,
  FileText,
  ImagePlus,
  Loader2,
  MapPin,
  Timer,
  X,
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
  if (!rule) return 'That file type isn’t supported. Use a JPEG, PNG or WebP image, or a PDF, DOCX or TXT file.';
  if (file.size === 0) return 'That file is empty. Choose another one.';
  if (file.size > rule.maxBytes) {
    return rule.kind === 'image' ? 'Images can be up to 8 MB.' : 'Documents can be up to 10 MB.';
  }
  return null;
}

/** Defensive shape of the submit response's `group`. */
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
type Field = 'rawText' | 'locationZone';

const STEPS = [
  { id: 0, label: 'Location' },
  { id: 1, label: 'Details' },
  { id: 2, label: 'Review' },
];

/** Upload with real progress (fetch has no upload progress events). */
function uploadWithProgress(
  file: File,
  onProgress: (pct: number) => void
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/complaints/upload');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error body */
      }
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

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
    <button type="button" onClick={copy} aria-label={`${label}: ${value}`} className="btn-icon w-9 h-9 shrink-0" title={label}>
      {copied ? <Check className="w-4 h-4 text-ok" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
    </button>
  );
}

function SuccessMark() {
  return (
    <motion.svg
      viewBox="0 0 52 52"
      className="w-14 h-14"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      aria-hidden="true"
    >
      <circle cx="26" cy="26" r="25" fill="rgba(34,197,94,0.12)" stroke="rgba(34,197,94,0.4)" strokeWidth="1.5" />
      <motion.path
        d="M15 27l7 7 15-16"
        fill="none"
        stroke="#22C55E"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.25, ease: EASE_OUT }}
      />
    </motion.svg>
  );
}

export default function StudentSubmitPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [rawText, setRawText] = useState('');
  const [locationZone, setLocationZone] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [uploadPct, setUploadPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Which field the current error belongs to: it gets aria-invalid and focus.
  const [errorField, setErrorField] = useState<Field | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const submitting = phase !== 'idle';

  // Reporting needs a student account (spec 01 §5): signed-out visitors sign in first.
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
      setErrorField(null);
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
    setStep(0);
  };

  const fail = (msg: string, field: Field | null = null) => {
    setErrorMsg(msg);
    setErrorField(field);
    setStatusMsg('');
    if (field) requestAnimationFrame(() => document.getElementById(field)?.focus());
  };

  const checkLocation = () => {
    if (!locationZone.trim()) {
      fail('Choose a room above, or type the building and room.', 'locationZone');
      return false;
    }
    return true;
  };
  const checkDetails = () => {
    const text = rawText.trim();
    if (text.length < RAW_TEXT_MIN) {
      fail(`Add a little more detail — at least ${RAW_TEXT_MIN} characters.`, 'rawText');
      return false;
    }
    if (text.length > RAW_TEXT_MAX) {
      fail(`Keep it under ${RAW_TEXT_MAX} characters.`, 'rawText');
      return false;
    }
    return true;
  };

  const goTo = (target: number) => {
    setErrorMsg(null);
    setErrorField(null);
    if (target > step) {
      if (step === 0 && !checkLocation()) return;
      if (step === 1 && !checkDetails()) return;
    }
    setDirection(target > step ? 1 : -1);
    setStep(target);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 2) {
      goTo(step + 1);
      return;
    }
    setErrorMsg(null);
    setErrorField(null);

    if (!checkLocation()) return setStep(0);
    if (!checkDetails()) return setStep(1);
    const text = rawText.trim();
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
        setUploadPct(0);
        setStatusMsg('Uploading attachment…');
        const up = await uploadWithProgress(selectedFile, setUploadPct);
        if (up.status === 401) {
          router.replace('/login');
          return;
        }
        if (up.status < 200 || up.status >= 300 || typeof up.data.url !== 'string') {
          throw new Error(typeof up.data.error === 'string' ? up.data.error : 'The attachment didn’t upload. Please try again.');
        }
        if (up.data.kind === 'image') imageUrl = up.data.url;
        else documentUrl = up.data.url;
        attachmentName = typeof up.data.attachmentName === 'string' ? up.data.attachmentName : null;
      }

      // 2. Submit the complaint. The student is taken from the session server-side.
      setPhase('submitting');
      setStatusMsg('Submitting and analysing your report…');
      const res = await fetch('/api/complaints/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ rawText: text, locationZone: locationZone.trim(), imageUrl, documentUrl, attachmentName }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      if (!res.ok || !data.success || !data.tracking_id) {
        throw new Error(data.error || 'We couldn’t submit your report. Please try again.');
      }

      const group: ReceiptGroup = data.group && typeof data.group === 'object' ? data.group : {};
      const parsedDeadline = group.stage_deadline ? Date.parse(group.stage_deadline) : NaN;

      setReceipt({
        tracking_id: String(data.tracking_id),
        receipt_id: data.receipt_id ? String(data.receipt_id) : '',
        group,
        deadline: Number.isFinite(parsedDeadline) ? parsedDeadline : Date.now() + TIER1_WINDOW_MS,
      });
      setStatusMsg(`Report submitted. Reference ${data.tracking_id}.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      fail(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
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
      <div className="max-w-2xl mx-auto py-16 px-4 sm:px-6">
        <div className="cs-card p-6 flex items-center gap-3 text-sm text-fg-muted" role="status" aria-live="polite">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span>{loading ? 'Checking your session…' : 'Taking you to sign in…'}</span>
        </div>
      </div>
    );
  }

  // Only students may file complaints (the upload/submit APIs enforce this too).
  if (user.role !== 'STUDENT') {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 sm:px-6">
        <div className="cs-card p-6 sm:p-8 space-y-4">
          <h1 className="text-xl font-semibold">Reports are filed from student accounts</h1>
          <p className="text-sm text-fg-muted">Your staff account handles complaints from the console.</p>
          <Link href={homePathForRole(user.role)} className="btn-primary">
            Open console <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  const group = receipt?.group;
  const handler = group?.current_handler_role || 'TEACHER';
  const hashtags = Array.isArray(group?.hashtags) ? group!.hashtags : [];
  const textLen = rawText.trim().length;

  return (
    <div className="max-w-2xl mx-auto py-10 sm:py-16 px-4 sm:px-6">
      {liveRegion}
      <AnimatePresence mode="wait">
        {!receipt ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            <header>
              <h1 className="text-3xl sm:text-4xl font-semibold">Report an issue</h1>
              <p className="mt-2 text-fg-muted flex items-center gap-2">
                <EyeOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                Staff never see your name or email — only a ticket number.
              </p>
            </header>

            {/* Step indicator */}
            <nav aria-label="Progress" className="mt-8">
              <ol className="grid grid-cols-3 gap-2">
                {STEPS.map((s) => {
                  const done = s.id < step;
                  const current = s.id === step;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => s.id < step && goTo(s.id)}
                        disabled={s.id >= step || submitting}
                        aria-current={current ? 'step' : undefined}
                        className="w-full text-left disabled:cursor-default group/step"
                      >
                        <span className="block h-1 rounded-full bg-white/[0.08] overflow-hidden">
                          <motion.span
                            className="block h-full rounded-full bg-fg"
                            initial={false}
                            animate={{ width: done || current ? '100%' : '0%' }}
                            transition={{ duration: 0.5, ease: EASE_OUT }}
                          />
                        </span>
                        <span
                          className={`mt-2 flex items-center gap-1.5 text-sm ${
                            current ? 'text-fg font-medium' : done ? 'text-fg-muted group-hover/step:text-fg' : 'text-fg-subtle'
                          }`}
                        >
                          {done && <Check className="w-3.5 h-3.5 text-ok" aria-hidden="true" />}
                          <span className="font-mono text-xs">{s.id + 1}</span> {s.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <form onSubmit={handleSubmit} className="mt-6 cs-card p-5 sm:p-7" aria-busy={submitting} noValidate>
              <AnimatePresence initial={false}>
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div id="form-error" role="alert" className="alert-error mb-5">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                      <span>{errorMsg}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence mode="wait" custom={direction} initial={false}>
                <motion.div
                  key={step}
                  custom={direction}
                  initial={{ opacity: 0, x: direction * 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction * -24 }}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                >
                  {step === 0 && (
                    <fieldset>
                      <legend className="text-lg font-semibold">Where is it?</legend>
                      <p className="mt-1 text-sm text-fg-muted">Pick a common location or type your own.</p>
                      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Common locations">
                        {ACADEMIC_LOCATION_PRESETS.map((preset) => {
                          const active = locationZone === preset;
                          return (
                            <button
                              key={preset}
                              type="button"
                              aria-pressed={active}
                              onClick={() => {
                                setLocationZone(preset);
                                if (errorField === 'locationZone') setErrorMsg(null);
                              }}
                              className={`h-9 px-3 rounded-lg text-sm border transition-colors ${
                                active
                                  ? 'bg-fg text-ink-950 border-fg font-medium'
                                  : 'border-line bg-ink-950/50 text-fg-muted hover:text-fg hover:border-line-strong'
                              }`}
                            >
                              {preset}
                            </button>
                          );
                        })}
                      </div>
                      <label htmlFor="locationZone" className="cs-field-label mt-6">
                        Building and room
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" aria-hidden="true" />
                        <input
                          id="locationZone"
                          name="locationZone"
                          type="text"
                          required
                          aria-required="true"
                          suppressHydrationWarning
                          value={locationZone}
                          onChange={(e) => {
                            setLocationZone(e.target.value);
                            if (errorField === 'locationZone') setErrorMsg(null);
                          }}
                          placeholder="e.g. B.Tech Block, Fluid Mechanics Lab 102"
                          aria-invalid={errorField === 'locationZone' && errorMsg ? true : undefined}
                          aria-describedby={errorField === 'locationZone' && errorMsg ? 'form-error' : undefined}
                          className="cs-input pl-10"
                        />
                      </div>
                    </fieldset>
                  )}

                  {step === 1 && (
                    <fieldset className="space-y-6">
                      <legend className="text-lg font-semibold">What&apos;s wrong?</legend>
                      <div>
                        <div className="flex items-baseline justify-between gap-3">
                          <label htmlFor="rawText" className="cs-field-label">
                            Description
                          </label>
                          <span
                            id="rawText-count"
                            className={`text-xs font-mono tabular-nums ${
                              rawText.length > RAW_TEXT_MAX ? 'text-bad-soft' : textLen >= RAW_TEXT_MIN ? 'text-ok-soft' : 'text-fg-subtle'
                            }`}
                          >
                            {rawText.length}/{RAW_TEXT_MAX}
                          </span>
                        </div>
                        <textarea
                          id="rawText"
                          name="rawText"
                          required
                          aria-required="true"
                          aria-describedby={errorField === 'rawText' && errorMsg ? 'rawText-count rawText-hint form-error' : 'rawText-count rawText-hint'}
                          aria-invalid={errorField === 'rawText' && errorMsg ? true : undefined}
                          rows={6}
                          maxLength={RAW_TEXT_MAX}
                          value={rawText}
                          onChange={(e) => {
                            setRawText(e.target.value);
                            if (errorField === 'rawText') setErrorMsg(null);
                          }}
                          placeholder="What is broken, since when, and is anyone at risk?"
                          className="cs-input"
                        />
                        <p id="rawText-hint" className="cs-hint">
                          Minimum {RAW_TEXT_MIN} characters. Don&apos;t include your name.
                        </p>
                      </div>

                      <div>
                        <span id="attachment-label" className="cs-field-label">
                          Photo or document <span className="text-fg-muted font-normal">(optional)</span>
                        </span>
                        {!selectedFile ? (
                          <div className="space-y-2">
                            {/* `capture` makes phones open the rear camera directly; a separate
                                picker keeps documents selectable (capture would hide them). */}
                            <div className="grid grid-cols-2 gap-2">
                              <label
                                htmlFor="attachment-camera"
                                className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border border-dashed border-line-strong bg-ink-950/50 cursor-pointer text-center transition-colors hover:border-fg-subtle hover:bg-ink-800/50 focus-within:border-steel focus-within:ring-4 focus-within:ring-steel/10"
                              >
                                <Camera className="w-6 h-6 text-fg-muted" aria-hidden="true" />
                                <span className="text-sm font-medium">Take photo</span>
                                <input
                                  id="attachment-camera"
                                  name="file"
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  aria-describedby="attachment-hint"
                                  onChange={handleFileChange}
                                  className="sr-only"
                                />
                              </label>
                              <label
                                htmlFor="attachment"
                                className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border border-dashed border-line-strong bg-ink-950/50 cursor-pointer text-center transition-colors hover:border-fg-subtle hover:bg-ink-800/50 focus-within:border-steel focus-within:ring-4 focus-within:ring-steel/10"
                              >
                                <ImagePlus className="w-6 h-6 text-fg-muted" aria-hidden="true" />
                                <span className="text-sm font-medium">Choose file</span>
                                <input
                                  id="attachment"
                                  name="file"
                                  type="file"
                                  aria-describedby="attachment-hint"
                                  accept="image/jpeg,image/png,image/webp,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain"
                                  onChange={handleFileChange}
                                  className="sr-only"
                                />
                              </label>
                            </div>
                            <p id="attachment-hint" className="text-xs text-fg-subtle">
                              Images up to 8 MB · PDF, DOCX or TXT up to 10 MB
                            </p>
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl border border-line bg-ink-950/50 flex items-center gap-3">
                            {filePreviewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={filePreviewUrl} alt="Attached image preview" className="w-12 h-12 rounded-lg object-cover border border-line" />
                            ) : (
                              <span className="w-12 h-12 rounded-lg border border-line inline-flex items-center justify-center">
                                <FileText className="w-5 h-5 text-fg-muted" aria-hidden="true" />
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{selectedFile.name}</div>
                              <div className="text-xs text-fg-subtle">{(selectedFile.size / 1024).toFixed(0)} KB · stored under a random name</div>
                            </div>
                            <button type="button" onClick={removeFile} disabled={submitting} className="btn-icon w-9 h-9" aria-label={`Remove ${selectedFile.name}`}>
                              <X className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </div>
                    </fieldset>
                  )}

                  {step === 2 && (
                    <div>
                      <h2 className="text-lg font-semibold">Review and submit</h2>
                      <dl className="mt-5 divide-y divide-line rounded-xl border border-line bg-ink-950/50">
                        <div className="p-4 flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <dt className="text-xs text-fg-subtle">Location</dt>
                            <dd className="mt-1 text-sm">{locationZone}</dd>
                          </div>
                          <button type="button" onClick={() => goTo(0)} className="text-sm text-fg-muted hover:text-fg shrink-0">
                            Edit
                          </button>
                        </div>
                        <div className="p-4 flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <dt className="text-xs text-fg-subtle">Description</dt>
                            <dd className="mt-1 text-sm text-fg-muted whitespace-pre-line line-clamp-6 [overflow-wrap:anywhere]">{rawText.trim()}</dd>
                          </div>
                          <button type="button" onClick={() => goTo(1)} className="text-sm text-fg-muted hover:text-fg shrink-0">
                            Edit
                          </button>
                        </div>
                        <div className="p-4">
                          <dt className="text-xs text-fg-subtle">Attachment</dt>
                          <dd className="mt-1 text-sm text-fg-muted truncate">{selectedFile ? selectedFile.name : 'None'}</dd>
                        </div>
                      </dl>
                      <p className="alert-warn mt-5">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                        <span>If anyone is in danger right now, leave the area and alert lab staff or campus security first.</span>
                      </p>

                      {phase === 'uploading' && (
                        <div className="mt-5" aria-hidden="true">
                          <div className="flex justify-between text-xs text-fg-muted">
                            <span>Uploading attachment</span>
                            <span className="font-mono tabular-nums">{uploadPct}%</span>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <motion.div className="h-full bg-fg rounded-full" animate={{ width: `${uploadPct}%` }} transition={{ duration: 0.2 }} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="mt-7 pt-5 border-t border-line flex items-center justify-between gap-3">
                {step > 0 ? (
                  <button type="button" onClick={() => goTo(step - 1)} disabled={submitting} className="btn-ghost">
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
                  </button>
                ) : (
                  <span />
                )}
                <button type="submit" disabled={submitting} className="btn-primary h-11 px-5">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  <span>
                    {phase === 'uploading' ? 'Uploading…' : phase === 'submitting' ? 'Analysing…' : step < 2 ? 'Continue' : 'Submit report'}
                  </span>
                  {!submitting && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          /* Receipt (spec 02 §4) */
          <motion.section
            key="receipt"
            aria-labelledby="receipt-heading"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
            className="space-y-4"
          >
            <div className="cs-card p-6 sm:p-8 text-center">
              <div className="flex justify-center">
                <SuccessMark />
              </div>
              <h1 id="receipt-heading" className="mt-5 text-2xl sm:text-3xl font-semibold">
                Report submitted
              </h1>
              <p className="mt-2 text-fg-muted">Save your reference — it opens live status on the tracking page.</p>

              <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-line bg-ink-950/60">
                  <div className="min-w-0">
                    <dt className="text-xs text-fg-subtle">Reference ID</dt>
                    <dd className="mt-0.5 font-mono text-lg font-medium">{receipt.tracking_id}</dd>
                  </div>
                  <CopyButton value={receipt.tracking_id} label="Copy reference ID" />
                </div>
                {receipt.receipt_id && (
                  <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-line bg-ink-950/60">
                    <div className="min-w-0">
                      <dt className="text-xs text-fg-subtle">Personal receipt</dt>
                      <dd className="mt-0.5 font-mono text-lg font-medium">{receipt.receipt_id}</dd>
                    </div>
                    <CopyButton value={receipt.receipt_id} label="Copy receipt ID" />
                  </div>
                )}
              </dl>
            </div>

            <div className="cs-card p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-fg-muted">AI summary</h2>
                <UrgencyPill calm priority={group?.priority} score={typeof group?.priority_score === 'number' ? group.priority_score : null} />
              </div>
              {group?.normalized_title && <h3 className="text-lg font-semibold">{group.normalized_title}</h3>}
              {group?.ai_summary ? <SummaryLines summary={group.ai_summary} /> : <p className="text-sm text-fg-muted">The summary is still being generated.</p>}
              {group?.location_zone && (
                <p className="text-sm text-fg-muted flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" aria-hidden="true" />
                  {group.location_zone}
                </p>
              )}
              {hashtags.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
                  {hashtags.map((tag) => (
                    <li key={tag} className="hashtag-pill">
                      {tag}
                    </li>
                  ))}
                </ul>
              )}
              <div className="pt-4 border-t border-line flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-fg-muted">
                  <Timer className="w-4 h-4" aria-hidden="true" />
                  With {TIER_LABEL[handler] ?? handler}. Moves to Faculty if not handled in 72h.
                </span>
                <span className="h-7 px-2.5 inline-flex items-center rounded-lg border border-line text-xs">
                  <Countdown deadline={receipt.deadline} />
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => router.push(`/track?id=${encodeURIComponent(receipt.tracking_id)}`)}
                className="btn-primary h-11 sm:flex-1"
              >
                Track this complaint <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={resetForm} className="btn-secondary h-11">
                Report another issue
              </button>
            </div>
            <p className="text-center text-sm text-fg-muted">
              All your reports are in{' '}
              <Link href="/dashboard" className="text-fg underline-offset-4 hover:underline">
                My reports
              </Link>
              .
            </p>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
