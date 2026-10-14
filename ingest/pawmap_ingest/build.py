"""가공 실행: 출처 수집 → 병합 → 시도 파일·manifest 출력 → 검증 → 보고서(아키텍처 §6.5)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from .dedupe import dedupe
from .geocode import Geocoder
from .models import DatasetManifest, ManifestRegion, ManifestSource, PetPlace, RegionFile
from .regions import sido
from .sources import kcisa as kcisa_source
from .sources import mfds as mfds_source
from .sources.kto import KtoSource

BBOX_MARGIN = 0.1  # 데이터 범위 바깥 약 10km 까지는 같은 시도 파일로 본다


@dataclass
class BuildInputs:
    region_code: str
    version: str  # YYYYMMDD
    fetched_at: str  # ISO 시각
    kto: KtoSource | None = None
    mfds_rows: list[mfds_source.MfdsRow] | None = None
    mfds_fetched_at: str | None = None  # 식약처 파일을 받은 날
    geocoder: Geocoder | None = None
    kcisa_rows: list[kcisa_source.KcisaRow] | None = None
    kcisa_fetched_at: str | None = None  # 한국문화정보원 파일을 받은 날


@dataclass
class BuildReport:
    region_code: str
    counts: dict[str, int] = field(default_factory=dict)
    lines: list[str] = field(default_factory=list)

    def add(self, line: str = "") -> None:
        self.lines.append(line)

    def markdown(self) -> str:
        return "\n".join(self.lines) + "\n"


@dataclass
class BuildResult:
    places: list[PetPlace]
    services: list[PetPlace]  # 반려 생활 시설 — services.{code}.json 으로 따로 낸다
    report: BuildReport
    sources: list[ManifestSource]


def build_region(inp: BuildInputs) -> BuildResult:
    """한 시도를 가공한다. 관광공사 호출 상한에 걸리면 BudgetExceeded 를 그대로 올린다(호출한 쪽이 지역 단위로 멈춤)."""
    report = BuildReport(inp.region_code)
    sources: list[ManifestSource] = []
    report.add(f"# 가공 보고서 — 지역 {inp.region_code} {sido(inp.region_code).name} / 버전 {inp.version}")
    report.add()

    kto_places: list[PetPlace] = []
    if inp.kto:
        kto_places = inp.kto.places(inp.region_code, inp.fetched_at)
        s = inp.kto.stats
        sources.append(ManifestSource(source="KTO_PET", fetched_at=inp.fetched_at))
        report.add("## 한국관광공사 반려동물 동반여행")
        report.add(f"- 목록 {s.listed}건 → 대상 {len(kto_places)}건, 제외 유형 {s.excluded_types}")
        report.add(f"- 상세: 새로 받음 {s.detail_fetched} / 캐시 재사용 {s.detail_cached} / 빈 응답 {s.detail_empty}, 호출 누적 {s.calls}회")
        report.add(f"- 카테고리별 신분류(lclsSystm3) 분포 — 카페 판별 점검용: {s.lcls_by_category}")
        for w in s.parse_warnings:
            report.add(f"  - 파싱 경고: {w}")
        report.add()

    mfds_places: list[PetPlace] = []
    if inp.mfds_rows is not None:
        if not inp.geocoder or not inp.mfds_fetched_at:
            raise ValueError("식약처 가공에는 지오코더와 파일 수집일이 필요합니다")
        ms = mfds_source.MfdsStats()
        mfds_places = mfds_source.places(inp.mfds_rows, inp.region_code, inp.geocoder, inp.mfds_fetched_at, ms)
        sources.append(ManifestSource(source="MFDS_PET", fetched_at=inp.mfds_fetched_at, note="파일 다운로드(재배포 조건 미확인)"))
        report.add("## 식약처 반려동물 동반 가능 업소")
        report.add(f"- 파일 {ms.rows}행 → 지역 {ms.in_region}행(파일 내 중복 {ms.duplicates_in_file}) → 좌표 확보 {len(mfds_places)}건")
        report.add(f"- 좌표 변환: 주소 {ms.geocoded_address} / 이름 검색 {ms.geocoded_keyword} / 실패 {len(ms.failed)} (카카오 호출 {inp.geocoder.calls}회)")
        for f in ms.failed:
            report.add(f"  - 실패: {f}")
        report.add()

    kcisa_places: list[PetPlace] = []
    services: list[PetPlace] = []
    if inp.kcisa_rows is not None:
        if not inp.kcisa_fetched_at:
            raise ValueError("한국문화정보원 가공에는 파일 수집일이 필요합니다")
        ks = kcisa_source.KcisaStats()
        kcisa_places, services = kcisa_source.split_places(inp.kcisa_rows, inp.region_code, inp.kcisa_fetched_at, ks)
        sources.append(ManifestSource(source="KCISA_PET", fetched_at=inp.kcisa_fetched_at, note="파일 다운로드(공공데이터포털 15111389)"))
        used = {c: n for c, n in ks.by_category3.items() if c in kcisa_source.CATEGORY_MAP}
        service = {c: n for c, n in ks.by_category3.items() if c in kcisa_source.SERVICE_TYPES}
        skipped = {c: n for c, n in ks.by_category3.items() if c not in kcisa_source.CATEGORY_MAP and c not in kcisa_source.SERVICE_TYPES}
        report.add("## 한국문화정보원 반려동물 동반 시설")
        report.add(f"- 파일 {ks.rows}행 → 지역 {ks.in_region}행 → 동반 장소 {ks.used}건 + 반려 생활 {ks.services_used}건(파일 내 중복 {ks.duplicates_in_file}, 좌표 없음 {len(ks.no_coords)}, 최종작성일 없음 {ks.no_date})")
        report.add(f"- 동반 장소 분류 {used}")
        report.add(f"- 반려 생활 분류(별도 파일) {service}")
        report.add(f"- 제외한 분류 {skipped}")
        for w in ks.warnings:
            report.add(f"  - 파싱 경고: {w}")
        report.add()

    # 관광공사를 기준으로 식약처를 합치고, 그 결과를 기준으로 한국문화정보원을 합친다
    merged = dedupe(kto_places, mfds_places)
    merged3 = dedupe(merged.places, kcisa_places)
    report.add("## 출처 간 병합")
    for label, m in (("관광공사 ← 식약처", merged), ("기존 ← 한국문화정보원", merged3)):
        report.add(f"- {label}: 병합 {len(m.merged)}건, 검토 후보(50m 이내지만 이름·주소·전화 불일치) {len(m.review)}건")
        for a, b in m.merged:
            report.add(f"  - 병합: {a} ← {b}")
        for a, b, d in m.review:
            report.add(f"  - 검토: {a} ↔ {b} ({d}m)")
    report.add()
    merged = merged3

    places = sorted(merged.places, key=lambda p: p.id)
    by_cat: dict[str, int] = {}
    by_status: dict[str, int] = {}
    for p in places:
        by_cat[p.category] = by_cat.get(p.category, 0) + 1
        by_status[p.pet_status] = by_status.get(p.pet_status, 0) + 1
    report.counts = {"total": len(places), **by_cat}
    report.add("## 결과")
    report.add(f"- 총 {len(places)}곳, 카테고리 {by_cat}, 동반 상태 {by_status}")
    report.add(f"- 충돌 표시 {sum(p.conflicting_evidence for p in places)}곳")
    if services:
        report.add(f"- 반려 생활 시설 {len(services)}곳(services.{inp.region_code}.json)")
    return BuildResult(places=places, services=sorted(services, key=lambda p: p.id), report=report, sources=sources)


def _merge_sources(old: list[ManifestSource], new: list[ManifestSource]) -> list[ManifestSource]:
    """여러 시도를 따로 가공해도 manifest 의 출처 목록은 하나로 — 출처별 가장 최근 수집일을 남긴다."""
    by_source: dict[str, ManifestSource] = {s.source: s for s in old}
    for s in new:
        prev = by_source.get(s.source)
        if prev is None or s.fetched_at >= prev.fetched_at:
            by_source[s.source] = s
    return sorted(by_source.values(), key=lambda s: s.source)


def write_outputs(out_dir: Path, inp: BuildInputs, result: BuildResult) -> Path:
    places, services = result.places, result.services
    out_dir.mkdir(parents=True, exist_ok=True)
    file_name = f"places.{inp.region_code}.json"
    region = RegionFile(region_code=inp.region_code, version=inp.version, places=places)
    (out_dir / file_name).write_text(region.model_dump_json(by_alias=True, exclude_none=True, indent=1), encoding="utf-8")
    services_name = f"services.{inp.region_code}.json"
    if services:
        data = RegionFile(region_code=inp.region_code, version=inp.version, places=services)
        (out_dir / services_name).write_text(data.model_dump_json(by_alias=True, exclude_none=True), encoding="utf-8")
    elif (out_dir / services_name).exists():
        (out_dir / services_name).unlink()  # 이번 가공에 반려 생활 자료가 없으면 예전 파일을 남기지 않는다

    lats = [p.latitude for p in places + services] or [0.0]
    lngs = [p.longitude for p in places + services] or [0.0]
    entry = ManifestRegion(
        code=inp.region_code,
        name=sido(inp.region_code).name,
        file=file_name,
        count=len(places),
        bbox=(min(lats) - BBOX_MARGIN, min(lngs) - BBOX_MARGIN, max(lats) + BBOX_MARGIN, max(lngs) + BBOX_MARGIN),
        services_file=services_name if services else None,
        services_count=len(services) if services else None,
    )
    manifest_path = out_dir / "manifest.json"
    others: list[ManifestRegion] = []
    old_sources: list[ManifestSource] = []
    if manifest_path.exists():  # 다른 시도는 그대로 둔다
        old = DatasetManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
        others = [r for r in old.regions if r.code != inp.region_code]
        old_sources = old.sources if not old.is_mock else []
    manifest = DatasetManifest(
        version=inp.version,
        generated_at=inp.fetched_at,
        is_mock=False,
        sources=_merge_sources(old_sources, result.sources),
        regions=sorted(others + [entry], key=lambda r: r.code),
    )
    manifest_path.write_text(json.dumps(manifest.model_dump(by_alias=True, exclude_none=True), ensure_ascii=False, indent=1), encoding="utf-8")
    return out_dir / file_name
