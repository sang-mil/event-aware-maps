'use client';

import { useEffect, useState } from 'react';
import { usingStaticData } from '@/api';
import { REPLAY_MAX, REPLAY_MIN, clearReplayDate, dateLabel, replayDate, resetLegacyReplayForLiveDefault, setReplayDate, today } from '@/lib/app';

/**
 * 한국의 오늘 날짜를 기본으로 표시하고, 원하면 2025년 관측 자료를 다시 볼 수 있어요.
 * 날짜 선택은 이 기기에만 저장하고 서버로 보내지 않아요.
 */
export function ReplayBanner() {
  const [dates, setDates] = useState<{ today: string; replay: string | null } | null>(null);
  useEffect(() => {
    if (!usingStaticData) return;
    if (resetLegacyReplayForLiveDefault()) {
      window.location.reload();
      return;
    }
    setDates({ today: today(), replay: replayDate() });
  }, []);
  if (!usingStaticData || !dates) return null;
  return (
    <div className="replay-banner" role="note">
      <span>{dates.replay ? `2025년 관측 자료 다시 보기 · ${dateLabel(dates.replay, true)} 기준` : `오늘 날짜 · ${dateLabel(dates.today, true)} 기준`}</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 12 }}>2025 다시보기</span>
        <input
          type="date"
          aria-label="다시 볼 2025년 날짜"
          title="2025년 관측 자료 다시 보기"
          value={dates.replay ?? ''}
          min={REPLAY_MIN}
          max={REPLAY_MAX}
          onChange={(e) => {
            if (!e.target.value) return;
            setReplayDate(e.target.value);
            window.location.reload();
          }}
        />
      </label>
      {dates.replay && <button type="button" onClick={() => { clearReplayDate(); window.location.reload(); }}>오늘 자료 보기</button>}
    </div>
  );
}

/** 데이터 출처 한 줄 */
export function SourceNote() {
  return <p className="note source-note">자료: 서울특별시 공공데이터(서울교통공사 승하차 인원·서울시 실시간 도시데이터), 한국체육산업개발 공공데이터(올림픽공원 공연 정보)</p>;
}
