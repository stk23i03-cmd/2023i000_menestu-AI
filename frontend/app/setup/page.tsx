'use client';
import { useRouter } from 'next/navigation';
import { startSession } from '@/lib/api';
import { useState } from 'react';
export default function Setup() {
  const r = useRouter();
  const [track, setTrack] = useState<'進学' | '就職'>('進学');
  const [field, setField] = useState('');
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!field || !target) return alert('全て入力してください');
    setLoading(true);
    try {
      const s = await startSession(track, field, target);
      sessionStorage.setItem('sid', s.session_id);
      sessionStorage.setItem('first', s.first_message);
      r.push('/interview');

      12

    } catch (e) {
      alert('セッション開始に失敗しました');
    } finally { setLoading(false); }
  };
  return (
    <div className="container">
      <div className="header"><h1>面接練習AI</h1></div>
      <form onSubmit={submit} className="card" style={{ maxWidth: 560 }}>
        <label>進路区分(必須)</label>
        <select className="input" value={track} onChange={e => setTrack(e.target.value as any)}>
          <option value="進学">進学</option>
          <option value="就職">就職</option>
        </select>
        <div style={{ height: 10 }} />
        <label>目指している分野(必須)</label>
        <input className="input" value={field} onChange={e => setField(e.target.value)}
          placeholder="例: 情報工学 / 事務職 など" />
        <div style={{ height: 10 }} />
        <label>志望する企業名・学校名(必須)</label>
        <input className="input" value={target} onChange={e => setTarget(e.target.value)}
          placeholder="例: ○○大学 / △△株式会社" />
        <div style={{ height: 16 }} />
        <button className="button" disabled={loading}>{loading ? '開始中...' : '面接を開始'}</button>
      </form>
    </div>
  );
}