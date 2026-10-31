import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// POST /api/complaints/upload  (spec 02 §2.3, P0 #4)
// STUDENT session required. multipart/form-data with a single field `file`.
// Stored in the public `complaint-evidence` bucket as `<uuid>.<ext>` via the
// service-role client (the bucket has no anon/authenticated INSERT policy).
// Response: { url, kind: 'image' | 'document', attachmentName }
// attachmentName is the UUID filename — the original name is never stored.
// ---------------------------------------------------------------------------

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'complaint-evidence';
const MB = 1024 * 1024;
const IMAGE_MAX_BYTES = 8 * MB;
const DOCUMENT_MAX_BYTES = 10 * MB;
// Allow some multipart framing overhead before rejecting on Content-Length.
const REQUEST_MAX_BYTES = DOCUMENT_MAX_BYTES + 64 * 1024;

type Kind = 'image' | 'document';
type Magic = 'jpeg' | 'png' | 'webp' | 'pdf' | 'docx' | 'text';

interface AllowedType {
  mime: string;
  ext: string;
  kind: Kind;
  maxBytes: number;
  magic: Magic;
}

const ALLOWED: AllowedType[] = [
  { mime: 'image/jpeg', ext: 'jpg', kind: 'image', maxBytes: IMAGE_MAX_BYTES, magic: 'jpeg' },
  { mime: 'image/png', ext: 'png', kind: 'image', maxBytes: IMAGE_MAX_BYTES, magic: 'png' },
  { mime: 'image/webp', ext: 'webp', kind: 'image', maxBytes: IMAGE_MAX_BYTES, magic: 'webp' },
  { mime: 'application/pdf', ext: 'pdf', kind: 'document', maxBytes: DOCUMENT_MAX_BYTES, magic: 'pdf' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
    kind: 'document',
    maxBytes: DOCUMENT_MAX_BYTES,
    magic: 'docx',
  },
  { mime: 'text/plain', ext: 'txt', kind: 'document', maxBytes: DOCUMENT_MAX_BYTES, magic: 'text' },
];

const EXTENSION_ALIASES: Record<string, string> = { jpeg: 'jpg', jpe: 'jpg' };

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

/**
 * Resolve the allowed type from the declared MIME; fall back to the extension only
 * when the browser sent no useful MIME (some OSes send '' or octet-stream for .docx).
 * The declared MIME and extension must not contradict each other.
 */
function resolveType(file: File): AllowedType | null {
  const declared = (file.type || '').toLowerCase().split(';')[0].trim();
  const rawExt = (file.name.split('.').pop() || '').toLowerCase();
  const ext = EXTENSION_ALIASES[rawExt] ?? rawExt;
  const byExt = ALLOWED.find((t) => t.ext === ext) ?? null;

  if (declared && declared !== 'application/octet-stream') {
    const byMime = ALLOWED.find((t) => t.mime === declared) ?? null;
    if (!byMime) return null;
    if (byExt && byExt.mime !== byMime.mime) return null;
    return byMime;
  }
  return byExt;
}

function startsWith(buf: Uint8Array, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buf[offset + i] !== bytes[i]) return false;
  }
  return true;
}

function ascii(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0));
}

function containsAscii(buf: Uint8Array, needle: string, limit = buf.length): boolean {
  const n = ascii(needle);
  const end = Math.min(buf.length, limit) - n.length;
  outer: for (let i = 0; i <= end; i++) {
    for (let j = 0; j < n.length; j++) {
      if (buf[i + j] !== n[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Verify the file's real content matches its claimed type. */
function magicMatches(buf: Uint8Array, magic: Magic): boolean {
  switch (magic) {
    case 'jpeg':
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    case 'png':
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'webp':
      return startsWith(buf, ascii('RIFF')) && startsWith(buf, ascii('WEBP'), 8);
    case 'pdf':
      // '%PDF-' must appear at the start (allow a small leading-junk window per PDF readers).
      return startsWith(buf, ascii('%PDF-')) || containsAscii(buf, '%PDF-', 1024);
    case 'docx':
      // OOXML = ZIP local file header, and the archive must contain the word/ part.
      return startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) && containsAscii(buf, 'word/');
    case 'text': {
      // No magic for text: require valid UTF-8 with no NUL bytes (rejects binaries).
      if (buf.includes(0)) return false;
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(buf);
        return true;
      } catch {
        return false;
      }
    }
  }
}

export async function POST(req: NextRequest) {
  // Allow uploads from both signed-in students and guest report submitters

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > REQUEST_MAX_BYTES) {
    return errorResponse(413, 'File is too large. Images up to 8 MB, documents up to 10 MB.');
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse(400, 'Expected multipart/form-data with a "file" field.');
  }

  const entry = form.get('file');
  if (!entry || typeof entry === 'string') {
    return errorResponse(400, 'No file provided. Attach it in the "file" field.');
  }
  const file = entry as File;
  if (file.size === 0) {
    return errorResponse(400, 'The attached file is empty.');
  }

  const type = resolveType(file);
  if (!type) {
    return errorResponse(
      415,
      'Unsupported file type. Allowed: JPEG, PNG, WebP images or PDF, DOCX, TXT documents.'
    );
  }
  if (file.size > type.maxBytes) {
    return errorResponse(
      413,
      type.kind === 'image'
        ? 'Image is too large (maximum 8 MB).'
        : 'Document is too large (maximum 10 MB).'
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > type.maxBytes) {
    return errorResponse(413, 'File is too large.');
  }
  if (!magicMatches(bytes, type.magic)) {
    return errorResponse(415, 'File contents do not match its declared type.');
  }

  const attachmentName = `${crypto.randomUUID()}.${type.ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(attachmentName, bytes, {
      contentType: type.mime,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('[upload] storage upload failed:', uploadError.message);
    return errorResponse(500, 'Failed to store the attachment. Please retry.');
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(attachmentName);

  return NextResponse.json(
    { url: data.publicUrl, kind: type.kind, attachmentName },
    { status: 201 }
  );
}
