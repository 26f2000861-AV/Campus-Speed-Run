import { NextRequest, NextResponse } from 'next/server';
import { triageComplaintWithGemini } from '@/lib/gemini';
import { loadEvidenceImage } from '@/lib/evidence';
import { requireRole } from '@/lib/server-auth';
import { errorResponse, getActiveClusters, insertComplaint, isEvidenceUrl } from '@/lib/store';

const MIN_TEXT = 15;
const MAX_TEXT = 2000;
const MAX_LOCATION = 200;
const MAX_ATTACHMENT_NAME = 255;

function bad(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

function optionalString(value: unknown): unknown {
  return value === undefined || value === null || value === '' ? null : value;
}

/**
 * POST /api/complaints/submit — STUDENT session only (spec 01 §5: no guest submit).
 * Body: { rawText, locationZone, imageUrl?, documentUrl?, attachmentName? }.
 * studentId always comes from the session; any client-supplied id is ignored.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['STUDENT']);
  if ('response' in auth) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return bad('Invalid JSON body.');
    const { rawText, locationZone, imageUrl, documentUrl, attachmentName } = body as Record<string, unknown>;

    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (text.length < MIN_TEXT || text.length > MAX_TEXT) {
      return bad(`Problem narration must be between ${MIN_TEXT} and ${MAX_TEXT} characters.`);
    }
    const location = typeof locationZone === 'string' ? locationZone.trim() : '';
    if (!location || location.length > MAX_LOCATION) {
      return bad(`Location zone is required (max ${MAX_LOCATION} characters).`);
    }

    // Evidence must live in this project's public `complaint-evidence` bucket.
    const image = optionalString(imageUrl);
    const document = optionalString(documentUrl);
    if (image !== null && !isEvidenceUrl(image)) {
      return bad('imageUrl must be a file uploaded via /api/complaints/upload.');
    }
    if (document !== null && !isEvidenceUrl(document)) {
      return bad('documentUrl must be a file uploaded via /api/complaints/upload.');
    }
    const attachment =
      typeof attachmentName === 'string' && attachmentName.trim()
        ? attachmentName.trim().slice(0, MAX_ATTACHMENT_NAME)
        : null;

    // Duplicate-cluster detection against active (non-resolved) groups, plus the evidence
    // photo (if any) so Gemini can judge damage from the image too (spec 05 §2).
    const [activeClusters, photo] = await Promise.all([
      getActiveClusters(),
      image !== null ? loadEvidenceImage(image as string) : Promise.resolve(null),
    ]);
    const triage = await triageComplaintWithGemini(text, location, activeClusters, photo);

    const result = await insertComplaint({
      rawText: text,
      locationZone: location,
      imageUrl: image as string | null,
      documentUrl: document as string | null,
      attachmentName: attachment,
      studentId: auth.user.id,
      triage,
      activeClusterIds: activeClusters.map((c) => c.id),
    });

    return NextResponse.json(
      {
        success: true,
        tracking_id: result.tracking_id,
        receipt_id: result.receipt_id,
        group: result.group,
        can_track: result.can_track,
        clustered: result.clustered,
      },
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err, 'Complaint submission');
  }
}
