import { useCallback, useState } from 'react'
import type { PetProfile } from '../types/place'

// 반려견 조건은 이 기기 브라우저에만 저장한다(요구사항 §5.2). 저장이 막힌 환경에서도 세션 동안은 동작.
const STORAGE_KEY = 'pawmap.profile.v1'

function read(): PetProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PetProfile) : {}
  } catch {
    return {}
  }
}

export function useProfile() {
  const [profile, setProfileState] = useState<PetProfile>(read)

  const setProfile = useCallback((next: PetProfile) => {
    setProfileState(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // 사생활 보호 모드 등: 저장만 건너뛴다
    }
  }, [])

  return { profile, setProfile }
}

export function isProfileEmpty(p: PetProfile): boolean {
  return p.weightKg === undefined && p.dogCount === undefined && !p.indoorRequired
}

export function profileSummary(p: PetProfile): string {
  const parts = [
    p.weightKg !== undefined ? `${p.weightKg}kg` : null,
    p.dogCount !== undefined ? `${p.dogCount}마리` : null,
    p.indoorRequired ? '실내' : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : '조건 설정'
}
