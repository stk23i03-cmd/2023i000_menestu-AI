'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendTurn } from '@/lib/api';
import AvatarVRM from '@/components/AvatarVRM';
import RecordButton from '@/components/RecordButton';

type ChatItem = { role: 'me' | 'bot'; text: string };

export default function Interview() {
  const r = useRouter();
  const [sid, setSid] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // セッション確認＆初期メッセージ
  useEffect(() => {
    const s = sessionStorage.getItem('sid');
    const first = sessionStorage.getItem('first');
    if (!s || !first) {
      r.replace('/');
      return;
    }
    setSid(s);
    setItems([{ role: 'bot', text: first }]);
  }, [r]);

  // 送信処理（録音ブロブ→/turn→UI更新＆音声URLをAvatarに渡す）
  const onBlob = async (blob: Blob) => {
    if (!sid) return;
    setBusy(true);
    try {
      const res = await sendTurn(sid, blob);
      setItems(prev => [
        ...prev,
        { role: 'me', text: res.user_text },
        { role: 'bot', text: res.assistant_text },
      ]);

      // AvatarVRM に渡すためのフルURLを生成（BASE + /static/audio/xxx.wav）
      const full = new URL(
        res.audio_url,
        process.env.NEXT_PUBLIC_BACKEND_BASE_URL
      ).href;
      setAudioUrl(full);
    } catch (e) {
      alert('送信に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const end = () => r.push('/summary');

  return (
    <div className="container">
      <div className="header">
        <h1>面接練習</h1>
        <button className="button" onClick={end}>終了する</button>
      </div>

      <div className="grid">
        <div className="card">
          <div
            className="chat"
            style={{ minHeight: 380, maxHeight: 520, overflow: 'auto' }}
          >
            {items.map((m, i) => (
              <div key={i} className={m.role === 'me' ? 'me' : 'bot'}>
                {m.text}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <RecordButton onBlob={onBlob} disabled={busy} />
            <p className="small">録音→停止で送信。処理中はボタンが無効になります。</p>
          </div>
        </div>

        {/* VRM アバター（音声に合わせて口パク・上半身の微揺れ） */}
        <AvatarVRM audioUrl={audioUrl} />
      </div>
    </div>
  );
}
