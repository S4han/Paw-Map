import { expect, test, type Page } from '@playwright/test'

// 가상 데이터(제주시청 기준 반경 3km): 동반 가능 6곳, 미확인 2곳(충돌 1), 동반 불가 1곳
// 위치 권한이 없는 기본 상태에서는 앱 시작 때의 자동 위치 요청이 거부되어 제주시청 기준으로 남는다
const summary = (page: Page) => page.getByText(/기준 · \d+곳 · 거리순/)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(summary(page)).toContainText('6곳')
})

test('첫 화면: 목록이 기본, 지도보기로 전환, 출처·기준일', async ({ page }) => {
  await expect(page.getByText('가상(Mock) 데이터로 보여주는 개발용 화면')).toBeVisible()
  await expect(page.getByRole('tab', { name: '전체' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: /지도보기/ }).click()
  await expect(page.getByText('카카오 지도 키가 없어 목록으로 보여드려요')).toBeVisible()
  await page.getByRole('button', { name: /목록보기/ }).click()
  await expect(page.getByText(/자료:/)).toContainText('가상 데이터')
  await expect(page.getByText('방문 전 업체에 꼭 확인하세요')).toBeVisible()
})

test('카테고리 탭·동반 상태·공간 필터', async ({ page }) => {
  await page.getByRole('tab', { name: /카페/ }).click()
  await expect(summary(page)).toContainText('3곳') // 동반 가능 카페: 멍멍·오름베이커리·골목
  await page.getByLabel('공간').selectOption('INDOOR')
  await expect(summary(page)).toContainText('1곳') // 실내 가능이라고 출처가 말한 곳만(멍멍카페)
  await page.getByLabel('공간').selectOption('ANY')
  await page.getByRole('tab', { name: '전체' }).click()
  await page.getByLabel('동반 상태').selectOption('ALL')
  await expect(summary(page)).toContainText('9곳')
  await expect(page.getByText('⚠️ 출처 간 정보 충돌').first()).toBeVisible()
})

test('반려견 조건 매칭: 12kg · 2마리', async ({ page }) => {
  await page.getByRole('button', { name: /조건 설정/ }).click()
  await page.getByLabel('몸무게').fill('12')
  await page.getByRole('button', { name: '한 마리 늘리기' }).click()
  await page.getByRole('button', { name: '한 마리 늘리기' }).click()
  await page.getByRole('button', { name: '적용하기' }).click()

  const chips = page.getByRole('group', { name: '내 반려견 조건 매칭' })
  await expect(chips.getByRole('button', { name: /조건 적합 2/ })).toBeVisible()
  await expect(chips.getByRole('button', { name: /확인 필요 3/ })).toBeVisible()
  await expect(chips.getByRole('button', { name: /조건 불일치 1/ })).toBeVisible()

  await chips.getByRole('button', { name: /조건 불일치/ }).click()
  await expect(summary(page)).toContainText('1곳')
  await expect(page.getByText('몸무게 제한 10kg 이하')).toBeVisible()

  // 조건은 이 기기에 저장되어 새로고침 후에도 유지
  await page.reload()
  await expect(page.getByRole('button', { name: /12kg · 2마리/ })).toBeVisible()
})

test('몸무게 입력 범위 검증', async ({ page }) => {
  await page.getByRole('button', { name: /조건 설정/ }).click()
  await page.getByLabel('몸무게').fill('150')
  await expect(page.getByText('0.5~100kg 사이로 입력해 주세요')).toBeVisible()
  await expect(page.getByRole('button', { name: '적용하기' })).toBeDisabled()
})

test('상세: 카드로 열고 뒤로가기로 닫기', async ({ page }) => {
  await page.getByRole('button', { name: /\(가상\) 멍멍카페/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: '(가상) 멍멍카페' })).toBeVisible()
  await expect(page).toHaveURL(/#\/place\/mock%3A1$/)
  await expect(dialog.getByText('15kg 이하')).toBeVisible()
  await expect(dialog.getByText(/출처 수정·확인 2026-08-01 · 조회 2026-10-13/)).toBeVisible()
  await expect(dialog.getByRole('link', { name: /전화하기/ })).toHaveAttribute('href', 'tel:0640000001')
  await expect(dialog.getByRole('link', { name: '카카오맵 길찾기 ↗' })).toHaveAttribute('href', /map\.kakao\.com\/link\/to\//)
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('공유 링크로 숙소 상세 바로 열기', async ({ page }) => {
  await page.goto('/#/place/mock%3A4')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: '(가상) 한라펜션' })).toBeVisible()
  await expect(dialog.getByText(/예약 가능 여부·객실 조건은 예약 사이트나 숙소에서 확인/)).toBeVisible()
  await expect(dialog.getByRole('link', { name: /예약 사이트로 이동/ })).toBeVisible()
  await dialog.getByRole('button', { name: '목록으로 돌아가기' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).not.toHaveURL(/#\/place/)
})

test('위치 권한이 없어도 안내 후 계속 사용 가능', async ({ page, context }) => {
  await context.clearPermissions()
  await page.getByRole('button', { name: '현재 위치로 찾기' }).click()
  await expect(page.getByText(/지역 검색으로도 이용할 수 있어요/)).toBeVisible()
  await expect(summary(page)).toContainText('6곳')
})

test('즐겨찾기: 상세에서 저장하면 "저장한 곳"에 남고 새로고침 후에도 유지', async ({ page }) => {
  await page.getByRole('button', { name: /\(가상\) 멍멍카페/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: '이 장소 저장' }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: '저장 해제' })).toBeVisible()
  await page.goBack()

  await page.getByRole('button', { name: /저장한 곳 1/ }).click()
  const saved = page.getByRole('list', { name: '저장한 곳' })
  await expect(saved.getByRole('button', { name: /\(가상\) 멍멍카페/ })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: /저장한 곳 1/ })).toBeVisible()
})

test('코스 추천: 관광지 → 음식점 → 카페, 동반 가능 장소만 가까운 순', async ({ page }) => {
  await page.getByRole('button', { name: /코스 추천/ }).click()
  const sheet = page.getByRole('dialog', { name: /반려견 동반 코스/ })
  const stops = sheet.getByRole('list', { name: '코스 순서' }).getByRole('listitem')
  await expect(stops).toHaveCount(3)
  await expect(stops.nth(0)).toContainText('(가상) 별빛오름')
  await expect(stops.nth(1)).toContainText('(가상) 바다식당') // 노펫국수(동반 불가)는 제외
  await expect(stops.nth(2)).toContainText('(가상) 골목카페')
  await stops.nth(1).getByRole('button').click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: '(가상) 바다식당' })).toBeVisible()
})

test('신선도·제보: 확인일 없는 장소는 재확인 안내, 제보는 GitHub 이슈로', async ({ page }) => {
  await page.getByRole('button', { name: /\(가상\) 바다식당/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/언제 확인한 정보인지 알려 주지 않았어요/)).toBeVisible()
  await expect(dialog.getByRole('link', { name: /정보 수정 제보하기/ })).toHaveAttribute('href', /github\.com\/S4han\/Paw-Map\/issues\/new\?title=/)
})

test('반려 생활: 전체 탭에는 없고, 반려 생활 탭에서 세부 분류와 함께 보인다', async ({ page }) => {
  const tab = page.getByRole('tab', { name: /반려 생활/ })
  await expect(tab).toHaveAttribute('aria-selected', 'false')
  await expect(page.getByText('(가상) 한라동물병원')).toHaveCount(0)
  await tab.click()
  await expect(summary(page)).toContainText('2곳')
  await expect(page.getByRole('button', { name: /\(가상\) 한라동물병원/ })).toContainText('반려 생활 · 동물병원')
  await expect(page.getByText(/반려 생활은 동반 장소가 아니라/)).toBeVisible()
})

test('카드: 크기 태그·♡ 저장', async ({ page }) => {
  const card = page.getByRole('button', { name: /\(가상\) 멍멍카페/ })
  await expect(card).toContainText('15kg 이하')
  await expect(page.getByRole('button', { name: /\(가상\) 오름베이커리/ })).toContainText('크기 정보 없음')
  await page.getByRole('listitem').filter({ has: card }).getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByRole('button', { name: /저장한 곳 1/ })).toBeVisible()
})

test.describe('위치 권한 허용', () => {
  test.use({ permissions: ['geolocation'], geolocation: { latitude: 33.4996, longitude: 126.5312 } })

  test('앱을 열면 내 위치를 기준으로 검색', async ({ page }) => {
    await expect(summary(page)).toContainText('내 위치')
    await expect(page.getByText(/위치 권한이 꺼져 있어요/)).toHaveCount(0)
  })
})
