'use client';

import { useEffect, useState } from 'react';
import { usingStaticData } from '@/api';
import { REPLAY_MAX, REPLAY_MIN, dateLabel, setReplayDate, today } from '@/lib/app';

/**
 * 2025 리플레이 안내 띠.
 * 발행된 실제 데이터가 2025년 것뿐이라, 정적 데이터 모드에서는 2025년의 하루를 '오늘'로 다시 보여줘요.
 * 날짜를 바꾸면 기기에만 저장하고(서버로 보내지 않아요) 화면을 새로 불러요.
 */
export function ReplayBanner() {
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => setDate(today()), []);
  if (!usingStaticData || !date) return null;
  return (
    <div className="replay-banner" role="note">
      <span>2025년 실제 데이터 다시 보기 · {dateLabel(date)} 기준</span>
      <input
        type="date"
        aria-label="다시 볼 날짜"
        value={date}
        min={REPLAY_MIN}
        max={REPLAY_MAX}
        onChange={(e) => {
          if (!e.target.value) return;
          setReplayDate(e.target.value);
          window.location.reload();
        }}
      />
    </div>
  );
}

/** 데이터 출처 한 줄 */
export function SourceNote() {
  return <p className="note source-note">자료: 서울특별시 공공데이터(서울교통공사 승하차 인원), 한국체육산업개발 공공데이터(올림픽공원 공연 정보)</p>;
}
