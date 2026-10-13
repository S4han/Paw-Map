// 데이터셋 공통 모델. ingest/pawmap_ingest/models.py 와 같은 구조를 유지한다(docs/architecture.md §5).
// 선택 필드가 undefined 이면 "확인되지 않음"이다. true/false 로 바꾸지 않는다.

export type Category = 'RESTAURANT' | 'CAFE' | 'STAY' | 'ATTRACTION'
export type PetStatus = 'ALLOWED' | 'NOT_ALLOWED' | 'UNKNOWN'
export type MatchStatus = 'MATCH' | 'MISMATCH' | 'NEEDS_CONFIRMATION'
export type EvidenceType = 'OFFICIAL' | 'BUSINESS_CONFIRMED' | 'PROVIDER' | 'USER_REPORT'
export type SourceId = 'KTO_PET' | 'MFDS_PET' | 'GOOGLE' | 'MOCK'

export interface Evidence {
  source: SourceId
  sourceId?: string
  type: EvidenceType
  petStatus: PetStatus // 이 출처가 말하는 동반 여부
  checkedAt?: string // 출처가 준 수정·확인일. 없으면 비움
  fetchedAt: string // 가공 파이프라인이 받은 시각(확인일 아님)
  url?: string
  claim: string
  rawText?: Record<string, string>
}

export type ConditionField =
  | 'indoorAllowed'
  | 'outdoorAllowed'
  | 'maxWeightKg'
  | 'maxWeightExclusive'
  | 'noWeightLimit'
  | 'maxDogs'
  | 'carrierRequired'
  | 'leashRequired'
  | 'additionalFeeKRW'

export interface PetConditions {
  indoorAllowed?: boolean
  outdoorAllowed?: boolean
  maxWeightKg?: number
  maxWeightExclusive?: boolean
  noWeightLimit?: boolean
  maxDogs?: number
  carrierRequired?: boolean
  leashRequired?: boolean
  additionalFeeKRW?: number
  notes: string[]
  fieldSources: Partial<Record<ConditionField, SourceId[]>>
  conflicts: ConditionField[]
}

export interface PetPlace {
  id: string
  aliases?: string[]
  name: string
  category: Category
  latitude: number
  longitude: number
  address?: string
  phone?: string
  imageUrl?: string
  imageCopyright?: 'Type1' | 'Type3'
  petStatus: PetStatus
  petConditions: PetConditions
  evidence: Evidence[]
  conflictingEvidence: boolean
  lastVerifiedAt?: string
  googlePlaceId?: string
  bookingUrl?: string
}

export interface PetProfile {
  weightKg?: number
  dogCount?: number
  indoorRequired?: boolean
}

export interface RegionFile {
  regionCode: string
  version: string
  places: PetPlace[]
}

export interface DatasetManifest {
  version: string
  generatedAt: string
  isMock: boolean
  sources: { source: SourceId; fetchedAt: string; note?: string }[]
  regions: {
    code: string
    name: string
    file: string
    count: number
    bbox: [minLat: number, minLng: number, maxLat: number, maxLng: number]
  }[]
}
