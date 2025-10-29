'use client';
import { useEffect, useRef, useState } from 'react';
export default function RecordButton({ onBlob, disabled }: {
  onBlob: (b: Blob) => Promise<void>,
  disabled?: boolean
}) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const chunksRef = useRef<BlobPart[]>([]);
  useEffect(() => {
    return () => { rec?.stream.getTracks().forEach(t => t.stop()); };
  }, [rec]);
  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      chunksRef.current = [];
      await onBlob(blob);
      stream.getTracks().forEach(t => t.stop());
    };
    mr.start(); setRec(mr); setRecording(true);
  };
  const stop = () => { rec?.stop(); setRecording(false); };

  11

  return (
    <button className="button" onClick={recording ? stop : start} disabled={disabled}>
      {disabled ? '処理中...' : recording ? '送信する(録音停止)' : '録音開始'}
    </button>
  );
}