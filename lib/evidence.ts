import { supabaseAdmin } from './supabase';
import { isEvidenceUrl } from './store';
import type { TriageImage } from './gemini';

const BUCKET = 'complaint-evidence';
const EVIDENCE_PREFIX = `/storage/v1/object/public/${BUCKET}/`;
// Same limits as /api/complaints/upload; Gemini accepts inline images up to 20 MB.
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Loads an uploaded evidence photo so Gemini can inspect it (spec 05 §2: text AND photo).
 * The object is read from our own bucket by path with the service role — never fetched
 * from an arbitrary URL — so a crafted imageUrl cannot make the server request other hosts.
 * Returns null (text-only triage) on any problem; a photo must never block a submission.
 */
export async function loadEvidenceImage(imageUrl: string): Promise<TriageImage | null> {
  if (!isEvidenceUrl(imageUrl)) return null;
  try {
    const objectPath = decodeURIComponent(new URL(imageUrl).pathname.slice(EVIDENCE_PREFIX.length));
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(objectPath);
    if (error || !data) {
      console.warn('Evidence photo download failed; triaging text only:', error?.message);
      return null;
    }
    const mimeType = data.type;
    if (!IMAGE_TYPES.has(mimeType) || data.size === 0 || data.size > IMAGE_MAX_BYTES) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    return { mimeType, data: bytes.toString('base64') };
  } catch (err: any) {
    console.warn('Evidence photo could not be prepared; triaging text only:', err?.message);
    return null;
  }
}
