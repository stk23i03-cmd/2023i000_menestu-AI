'use client';
import { useEffect, useState } from 'react';
import { endSession } from '@/lib/api';

14

import { useRouter } from 'next/navigation';
export default function Summary() {
  const r = useRouter();
  const [text, setText] = useState('総評を生成中...');
  useEffect(() => {
    const sid = sessionStorage.getItem('sid');
    if (!sid) { r.replace('/'); return; }
    (async () => {
      try {
        const { summary } = await endSession(sid);
        setText(summary);
      } catch {
        setText('総評の取得に失敗しました');
      } finally {
        sessionStorage.removeItem('sid');
        sessionStorage.removeItem('first');
      }
    })();
  }, [r]);
  return (
    <div className="container">
      <div className="header">
        <h1>総評</h1>
        <button className="button" onClick={() => r.push('/')}>メニューへ戻る</button>
      </div>
      <div className="card" style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
    </div>
  );
}