import { AlbumUploadPolicy } from '../models';

// Mirrors backend `AlbumUploads.IsOpen` — keeps the UI gating in sync with
// the server's authoritative check so we don't show controls the API will
// reject.
export function isAlbumUploadOpen(
  policy: AlbumUploadPolicy,
  startUtc: string,
  endUtc: string,
  now: Date = new Date(),
): boolean {
  switch (policy) {
    case 'AlwaysOpen': return true;
    case 'OpenAfterEventStarted': return now.getTime() >= new Date(startUtc).getTime();
    case 'OpenAfterEventConcluded': return now.getTime() >= new Date(endUtc).getTime();
    default: return false;
  }
}
