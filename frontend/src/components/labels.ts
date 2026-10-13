import type { Category, EvidenceType, MatchStatus, PetStatus, SourceId } from '../types/place'

// 상태는 색만으로 구분하지 않고 아이콘 + 글자를 함께 쓴다(요구사항 §8.4)
export const petStatusLabel: Record<PetStatus, { icon: string; text: string; className: string }> = {
  ALLOWED: { icon: '✅', text: '동반 가능', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  NOT_ALLOWED: { icon: '🚫', text: '동반 불가', className: 'bg-rose-50 text-rose-800 ring-rose-200' },
  UNKNOWN: { icon: '❔', text: '미확인', className: 'bg-slate-100 text-slate-700 ring-slate-300' },
}

export const categoryLabel: Record<Category, string> = {
  RESTAURANT: '음식점',
  CAFE: '카페',
  STAY: '숙소',
  ATTRACTION: '관광지',
}

export const sourceLabel: Record<SourceId, string> = {
  KTO_PET: '한국관광공사',
  MFDS_PET: '식약처',
  GOOGLE: 'Google',
  MOCK: '가상 데이터',
}

export const evidenceTypeLabel: Record<EvidenceType, string> = {
  OFFICIAL: '공식',
  BUSINESS_CONFIRMED: '업체 확인',
  PROVIDER: '제공사',
  USER_REPORT: '제보(미확인)',
}

export const matchLabel: Record<MatchStatus, { icon: string; text: string; className: string }> = {
  MATCH: { icon: '🟢', text: '조건 적합', className: 'bg-emerald-600 text-white ring-emerald-600' },
  NEEDS_CONFIRMATION: { icon: '🟡', text: '확인 필요', className: 'bg-amber-50 text-amber-900 ring-amber-300' },
  MISMATCH: { icon: '🔴', text: '조건 불일치', className: 'bg-rose-50 text-rose-800 ring-rose-200' },
}
