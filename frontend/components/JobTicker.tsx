'use client';

import { useMemo } from 'react';
import { TICKER_JOBS, type TickerJob } from '@/lib/tickerJobs';

function formatScore(job: TickerJob): {
  signedScore: string;
  direction: 'up' | 'down';
  delta: string;
} {
  const manualScore = Number(job.score);
  const exposure = Number(job.exposure);

  const score = Number.isFinite(manualScore)
    ? manualScore
    : Number.isFinite(exposure)
      ? exposure >= 5
        ? -(exposure / 10)
        : 1 - exposure / 10
      : 0;

  const direction = score < 0 ? 'down' : 'up';
  const delta = score < 0 ? '▼' : '▲';
  const signedScore = `${score >= 0 ? '+' : ''}${score.toFixed(3)}`;

  return { signedScore, direction, delta };
}

function TickerItem({ job }: { job: TickerJob }) {
  const { signedScore, direction, delta } = formatScore(job);
  const raw = Number.isFinite(Number(job.exposure))
    ? `AI EXPOSURE ${job.exposure}/10`
    : '';

  return (
    <span
      className={`job-ticker__item ${direction === 'up' ? 'is-up' : 'is-down'}`}
      title={raw}
    >
      <span className="job-ticker__title">{job.title}</span>
      <span className="job-ticker__score">
        {signedScore}
        <span className="job-ticker__delta">{delta}</span>
      </span>
    </span>
  );
}

export default function JobTicker() {
  const items = useMemo(
    () =>
      [...TICKER_JOBS, ...TICKER_JOBS].map((job, i) => (
        <TickerItem key={i} job={job} />
      )),
    [],
  );

  return (
    <div className="job-ticker" aria-label="RATe RACE live job exposure ticker">
      <div className="job-ticker__track" id="jobTickerTrack">
        {items}
      </div>
    </div>
  );
}
