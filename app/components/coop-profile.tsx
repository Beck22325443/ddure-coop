"use client";

import Image from "next/image";

export const NIKKES = [
  ["crown", "크라운"], ["mest", "메스트"], ["anis", "아니스"], ["privaty_favorite", "프리바티(애장품)"],
] as const;
export type NikkeKey = typeof NIKKES[number][0];
export type NikkeChoices = Record<NikkeKey, boolean | null>;
export const emptyNikkes = (): NikkeChoices => ({ crown: null, mest: null, anis: null, privaty_favorite: null });
export function readNikkes(): NikkeChoices {
  const result = emptyNikkes();
  try {
    const value: unknown = JSON.parse(localStorage.getItem("ddure_nikkes_v3") || "null");
    if (value && typeof value === "object") {
      for (const [key] of NIKKES) {
        const choice = (value as Record<string, unknown>)[key];
        if (typeof choice === "boolean") result[key] = choice;
      }
    }
  } catch { /* Missing or invalid saved choices must be answered again. */ }
  return result;
}
export function hasAllChoices(value: NikkeChoices): boolean {
  return NIKKES.every(([key]) => typeof value[key] === "boolean");
}
export function NikkeFields({ value, onChange }: { value: NikkeChoices; onChange: (value: NikkeChoices) => void }) {
  return <fieldset className="mb-4 space-y-2 rounded-xl border border-blue-100 bg-blue-50 p-3">
    <legend className="px-1 text-sm font-bold">필수 니케 보유 확인</legend>
    <p className="text-xs text-slate-600">4개 항목을 모두 선택해 주세요. 미보유도 신청할 수 있습니다.</p>
    {NIKKES.map(([key, label]) => <div key={key} className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex gap-1" role="group" aria-label={`${label} 보유 여부`}>
        {[true, false].map(choice => <button key={String(choice)} type="button" aria-pressed={value[key] === choice}
          className={`rounded-lg border px-3 py-2 text-xs font-bold ${value[key] === choice ? choice ? "border-blue-600 bg-blue-600 text-white" : "border-slate-600 bg-slate-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}
          onClick={() => onChange({ ...value, [key]: choice })}>{choice ? "보유" : "미보유"}</button>)}
      </div>
    </div>)}
  </fieldset>;
}
export function NikkeSummary({ value }: { value?: NikkeChoices | null }) {
  return <div className="mt-2 flex flex-wrap gap-1.5" aria-label="니케 보유 현황">
    {NIKKES.map(([key, label]) => <span key={key} className={`rounded-md px-2 py-1 text-xs ${value?.[key] === true ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>
      {label} · {value?.[key] === true ? "보유" : value?.[key] === false ? "미보유" : "미입력"}
    </span>)}
  </div>;
}
export function LevelBadge({ level }: { level: number | null }) {
  if (level === null || level < 1) return null;
  const text = `싱크로 ${level}`;
  if (level < 200 || level >= 700) return <span className="inline-flex shrink-0 items-center" title={text}>
    <Image src={level < 200 ? "/chick.png" : "/jige.png"} alt={`${text} · ${level < 200 ? "병아리" : "지게"}`} width={36} height={36} unoptimized className="h-9 w-9 object-contain" />
  </span>;
  return <span title={text} aria-label={text} className={`inline-block h-3 w-3 shrink-0 rounded-full ${level < 400 ? "bg-green-500" : "bg-red-500"}`} />;
}
