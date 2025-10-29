'use client';
import { useRouter } from 'next/navigation';
export default function Page() {
  const r = useRouter();
  return (
    <div className="center">
      <button className="button start" onClick={() => r.push('/setup')}>はじめる</button>
    </div>
  );
}