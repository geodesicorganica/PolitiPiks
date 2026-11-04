import { useState } from 'react';
import { parseReviewedFields, PROFILE_LABELS } from '../lib/reviewedProfile';

function Photo({ url }: { url: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return failedUrl === url ? <span className="text-slate-400">Photo unavailable</span> : <img src={url} alt="Candidate portrait" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} className="h-40 w-40 rounded object-cover" />;
}

export function ReviewedProfile({ value, labels = PROFILE_LABELS }: { value: unknown; labels?: Record<string, string> }) {
  const fields = parseReviewedFields(value, labels);
  if (!fields.length) return null;
  return <div className="grid gap-4 md:grid-cols-2" data-testid="reviewed-profile">
    {fields.map(({ key, label, field }) => <section key={key} className="border border-slate-700 bg-slate-900 p-5 rounded">
      <h2 className="text-lg font-bold mb-3">{label}</h2>
      {!field ? <p className="text-sm text-slate-400">Reviewed information is unavailable.</p> : <>
        {field.status === 'present' ? <>
          {field.attribution === 'candidate_statement' && <p className="text-xs text-slate-400 mb-2">Candidate statement · From the campaign</p>}
          {key === 'photo' && typeof field.value === 'string' ? <Photo url={field.value} /> : key === 'website' && typeof field.value === 'string' ? <a className="underline" href={field.value} target="_blank" rel="noopener noreferrer">Visit campaign website</a> : Array.isArray(field.value) ? <ul className="list-disc pl-5 space-y-2">{field.value.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p className="text-sm whitespace-pre-line">{field.value}</p>}
        </> : <p className="text-sm text-slate-400">{field.reason}</p>}
        <ul className="mt-4 space-y-1 text-xs text-slate-400">{field.sources.map((source, i) => <li key={i}><a className="underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.authority}</a> · Reviewed {new Date(source.reviewedAt).toLocaleDateString()}</li>)}</ul>
      </>}
    </section>)}
  </div>;
}
