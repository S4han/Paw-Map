"""데이터셋 공통 모델. frontend/src/types/place.ts 와 같은 구조를 유지한다(docs/architecture.md §5).

선택 필드가 None 이면 "확인되지 않음"이다. True/False 로 바꾸지 않는다.
JSON 은 프론트와 같은 camelCase 로 읽고 쓴다.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

# PET_SERVICE: 반려 생활 시설(동물병원·약국·미용·용품). 동반 장소가 아니며 매칭·코스에 쓰지 않는다
Category = Literal["RESTAURANT", "CAFE", "STAY", "ATTRACTION", "PET_SERVICE"]
PetStatus = Literal["ALLOWED", "NOT_ALLOWED", "UNKNOWN"]
EvidenceType = Literal["OFFICIAL", "BUSINESS_CONFIRMED", "PROVIDER", "USER_REPORT"]
SourceId = Literal["KTO_PET", "MFDS_PET", "KCISA_PET", "GOOGLE", "MOCK"]
ConditionField = Literal[
    "indoorAllowed",
    "outdoorAllowed",
    "maxWeightKg",
    "maxWeightExclusive",
    "noWeightLimit",
    "maxDogs",
    "carrierRequired",
    "leashRequired",
    "additionalFeeKRW",
]


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class Evidence(Model):
    source: SourceId
    source_id: str | None = None
    type: EvidenceType
    pet_status: PetStatus
    checked_at: str | None = None  # 출처가 준 수정·확인일
    fetched_at: str  # 가공 파이프라인이 받은 시각(확인일 아님)
    url: str | None = None
    claim: str
    raw_text: dict[str, str] | None = None


class PetConditions(Model):
    indoor_allowed: bool | None = None
    outdoor_allowed: bool | None = None
    max_weight_kg: float | None = Field(default=None, gt=0)
    max_weight_exclusive: bool | None = None
    no_weight_limit: bool | None = None
    max_dogs: int | None = Field(default=None, ge=1)
    carrier_required: bool | None = None
    leash_required: bool | None = None
    additional_fee_krw: int | None = Field(default=None, ge=0, alias="additionalFeeKRW")
    notes: list[str] = []
    field_sources: dict[ConditionField, list[SourceId]] = {}
    conflicts: list[ConditionField] = []

    @model_validator(mode="after")
    def _weight_rules(self) -> PetConditions:
        if self.no_weight_limit and self.max_weight_kg is not None:
            raise ValueError("noWeightLimit 과 maxWeightKg 를 함께 둘 수 없습니다")
        if self.max_weight_exclusive is not None and self.max_weight_kg is None:
            raise ValueError("maxWeightExclusive 는 maxWeightKg 가 있을 때만 의미가 있습니다")
        return self


class PetPlace(Model):
    id: str
    aliases: list[str] | None = None
    name: str = Field(min_length=1)
    category: Category
    subcategory: str | None = None  # 출처의 세부 분류(예: 박물관, 동물병원) — 화면 표시용
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: str | None = None
    phone: str | None = None
    parking_available: bool | None = None  # 출처가 준 주차 가능 여부(한국문화정보원). 없으면 모름
    image_url: str | None = None
    image_copyright: Literal["Type1", "Type3"] | None = None
    pet_status: PetStatus
    pet_conditions: PetConditions
    evidence: list[Evidence]
    conflicting_evidence: bool
    last_verified_at: str | None = None
    google_place_id: str | None = None
    booking_url: str | None = None


class RegionFile(Model):
    region_code: str
    version: str
    places: list[PetPlace]


class ManifestSource(Model):
    source: SourceId
    fetched_at: str
    note: str | None = None


class ManifestRegion(Model):
    code: str
    name: str
    file: str
    count: int = Field(ge=0)
    bbox: tuple[float, float, float, float]
    services_file: str | None = None  # 반려 생활 시설(필요할 때만 받음)
    services_count: int | None = Field(default=None, ge=0)


class DatasetManifest(Model):
    version: str
    generated_at: str
    is_mock: bool
    sources: list[ManifestSource]
    regions: list[ManifestRegion]
