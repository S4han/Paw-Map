# STEP 2 API 검증 PoC

`docs/api-analysis.md`의 검증 항목(V-1~V-15)을 실제 응답으로 확인하는 일회성 스크립트입니다. 앱 코드가 아니며 STEP 4 이후에 재사용하지 않습니다.

- Python 3.11 이상, **표준 라이브러리만** 사용(식약처 xlsx를 직접 읽을 때만 `openpyxl` 필요)
- 키는 환경변수로만 넣습니다. 스크립트는 출력·저장 파일에서 키를 가립니다.
- 결과는 `poc/out/`에 저장되며 이 폴더는 커밋되지 않습니다(데이터 이용조건 확인 전). 터미널에 나온 **요약만** 공유해 주세요.

## 준비

| 키 | 발급처 | 필요 작업 |
|---|---|---|
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터포털 | "한국관광공사_반려동물 동반여행 서비스" **활용신청**(승인 후 사용 가능까지 시간이 걸릴 수 있음) |
| `GOOGLE_PLACES_API_KEY` | Google Cloud 콘솔 | Places API (New) 사용 설정, **할당량 → 일일 요청 상한**과 예산 알림 먼저 설정 |

## 실행 (Windows PowerShell, 저장소 루트에서)

```powershell
$env:DATA_GO_KR_SERVICE_KEY = "발급받은 인증키"
python poc/kto_pet.py --details 30          # 관광공사: 약 45회 호출

$env:GOOGLE_PLACES_API_KEY = "발급받은 키"
python poc/google_places.py (Get-ChildItem poc/out/kto_pet-*.json | Select-Object -Last 1).FullName --limit 20
#   ↑ 유료 등급(Place Details Enterprise + Atmosphere) 최대 20건 — 실행 전 확인 질문이 나옵니다

# 식약처: 식품안전나라 '반려동물 동반 가능 업소 현황'에서 Excel을 받은 뒤
python poc/mfds_pet_restaurants.py "$HOME\Downloads\받은파일.xlsx"   # 먼저 pip install openpyxl
```

macOS/Linux는 `$env:X = "..."` 대신 `export X="..."`를 사용합니다.

## 실행 (GitHub Codespaces)

1. 저장소 **Settings → Secrets and variables → Codespaces → New repository secret**으로 `DATA_GO_KR_SERVICE_KEY`, `GOOGLE_PLACES_API_KEY` 등록(코드스페이스를 만든 뒤 등록했다면 코드스페이스를 다시 시작해야 반영됨)
2. 저장소 → 브랜치 `claude/step2-api-poc` 선택 → **Code → Codespaces → Create codespace**
3. 터미널(bash)에서:

```bash
python3 poc/kto_pet.py --details 30
python3 poc/google_places.py "$(ls -t poc/out/kto_pet-*.json | head -1)" --limit 20

# 식약처: PC·휴대폰 브라우저로 Excel을 받아 코드스페이스 왼쪽 탐색기로 끌어다 놓은 뒤
pip install openpyxl
python3 poc/mfds_pet_restaurants.py 받은파일.xlsx
```

4. 다 쓰면 코드스페이스를 **Stop** (무료 사용 시간·저장공간 초과 시 과금될 수 있음)

## 비용

| 스크립트 | 호출 | 예상 비용 |
|---|---|---|
| `kto_pet.py` | 공공데이터포털 약 45회 | 무료(일 한도 내) |
| `google_places.py --limit 20` | Text Search IDs Only 20회 + Place Details E+A 최대 20회 | 문서상 무료량(월 1,000건) 안 — **콘솔 가격표로 재확인 후 실행** |
| `mfds_pet_restaurants.py` | 없음(파일 분석) | 0 |
