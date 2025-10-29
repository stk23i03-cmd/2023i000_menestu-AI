const BASE = process.env.NEXT_PUBLIC_BACKEND_BASE_URL!;
export type SessionStart = { session_id: string; first_message: string };
export async function startSession(track: '進学' | '就職', field: string, target: string):
  Promise<SessionStart> {
  const fd = new FormData();
  fd.set('track', track);
  fd.set('field', field);
  fd.set('target', target);
  const res = await fetch(`${BASE}/session/start`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('failed to start session');
  return res.json();
}
export type TurnResult = { user_text: string; assistant_text: string; audio_url: string };
export async function sendTurn(session_id: string, blob: Blob): Promise<TurnResult> {
  const fd = new FormData();
  fd.set('session_id', session_id);
  fd.set('audio', new File([blob], 'rec.webm', { type: 'audio/webm' }));
  const res = await fetch(`${BASE}/turn`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('turn failed');
  return res.json();
}
export async function endSession(session_id: string): Promise<{ summary: string }> {
  const fd = new FormData();
  fd.set('session_id', session_id);
  const res = await fetch(`${BASE}/session/end`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('end failed');
  return res.json();
}