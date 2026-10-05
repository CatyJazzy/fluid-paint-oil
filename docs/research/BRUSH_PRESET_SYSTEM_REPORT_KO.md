# 괴짜 복원소 브러시 프리셋 시스템 연구·구현 보고서

버전: 0.2.0  
대상: Unity 6, URP, Metal, iPad + Apple Pencil  
범위: 유화 브러시 프리셋의 구조, 제작법, 런타임 평가, 미리보기, QA, 2인 개발 로드맵

---

## 0. 결론부터

브러시 프리셋은 `붓 모양 PNG + 크기`가 아니다. 사용자가 하나의 브러시라고 느끼는 것은 다음 다섯 층이 함께 만든 결과다.

1. **Stroke Path**: 입력점을 어떤 간격과 안정화 방식으로 dab으로 바꾸는가
2. **Tip / Grain**: dab의 실루엣과 내부 결, 캔버스 요철을 어떻게 표현하는가
3. **Input Dynamics**: 압력·속도·기울기·방향·회전·획 진행도가 무엇을 변화시키는가
4. **Paint Interaction**: 물감이 얼마나 묻고, 쌓이고, 섞이고, 끌리고, 고갈되는가
5. **Preview / Metadata**: 사용자가 선택 전에 결과를 예측하고, 저장·검색·버전 관리할 수 있는가

이 프로젝트에서는 프리셋이 장식 기능이 아니라 **게임의 손맛과 그림 앱으로서의 제품 정체성을 결정하는 콘텐츠**다. 엔진 하나를 만든 뒤 프리셋을 수십 개 복제하는 방식보다, 서로 다른 손동작과 역할을 가진 8개를 먼저 완성하는 편이 낫다.

v0.2 코드는 위 다섯 층을 모두 담을 수 있는 구조를 제공한다. 다만 물리 모델은 2인 팀에 맞춰 의도적으로 축소했다. 전체 3D 강모 시뮬레이션 대신 2D tip/grain, 결정적 dynamics, GPU 캔버스, 스칼라 paint load를 쓴다. 다음 단계의 핵심은 코드를 더 늘리는 것이 아니라 **실제 붓끝/그레인 에셋 제작과 실기기 튜닝**이다.

---

## 1. 용어를 먼저 통일한다

| 용어 | 이 문서에서의 뜻 |
|---|---|
| Stroke | 펜을 대고 떼기까지의 한 획 |
| Raw sample | OS/Unity가 전달한 불규칙한 입력점 |
| Dab / stamp | 붓끝 이미지를 한 번 찍는 최소 렌더 단위 |
| Brush tip / shape | 한 dab의 외곽과 강모 분포를 나타내는 마스크 |
| Grain | 종이·캔버스 결 또는 물감 내부 결을 조절하는 반복 텍스처 |
| Dynamics | 입력 신호를 크기·불투명도·각도 등 출력에 연결하는 규칙 |
| Flow | dab 한 번이 공급하는 색/질량의 비율 |
| Load / charge | 획 시작 시 붓에 들어 있는 물감의 총량 |
| Pickup | 캔버스의 기존 색을 붓이 받아들이는 정도 |
| Drag / pull | 붓이 기존 젖은 물감을 진행 방향으로 끄는 정도 |
| Wetness | 혼합과 이동이 가능한 정도 |
| Impasto / thickness | 쌓인 물감 높이와 조명 반응의 기반 값 |
| Preset | 위 모든 규칙과 참조 에셋, 이름, 미리보기를 묶은 버전 관리 자산 |

`Oil Paint`, `Rich Oil`, `Oil Flat Old` 같은 타일이 보이는 화면은 보통 **브러시 프리셋 패널**, **브러시 라이브러리**, 또는 **브러시 셸프**라고 부른다. 타일 속 선은 아이콘이 아니라 그 프리셋으로 만든 **표준 획 미리보기**다.

---

## 2. 상용·오픈 브러시 시스템에서 공통으로 확인되는 구조

### 2.1 Procreate

Procreate 공식 Brush Studio 문서는 획을 경로 위에 여러 shape point를 찍는 구조로 설명한다. Stroke Path에서 spacing과 여러 jitter를 다루고, Shape는 반복되는 붓끝, Grain은 그 안에서 굴러가는 페인트 롤러처럼 동작한다. Wet Mix에는 dilution, charge, attack, pull 등이 있으며 Apple Pencil 압력·기울기·회전과 색 dynamics도 연결한다.

특히 미리보기 설계가 중요하다. 공식 문서의 demo stroke는 왼쪽에서 오른쪽으로 가면서 압력이 증가하고 끝에서 감소한다. 그래서 사용자는 타일 하나만 보고도 압력에 따른 굵기와 농도 변화를 예측할 수 있다. stamp형 브러시는 단일 stamp preview로 전환한다.

우리에게 가져올 원칙:

- shape와 grain을 서로 다른 에셋/좌표계로 취급한다.
- load는 획 시작 시 충전되고 진행 중 감소한다.
- 미리보기는 실제 dynamics를 드러내는 표준 입력으로 렌더한다.
- 사용자가 자주 만지는 값과 제작자용 고급 값을 분리한다.

### 2.2 MyPaint / libmypaint

libmypaint는 입력과 출력 설정 사이에 매핑을 두는 구조가 매우 명확하다. 압력뿐 아니라 미세/거친 속도, 획 진행도, 방향, 기울기, 공격각, barrel rotation, 결정적 random 등을 입력으로 제공한다. 출력 쪽에는 반경, dab 밀도, jitter, 타원 비율/각도, HSV/HSL 변화, smudge와 smudge bucket 등이 있다.

우리에게 가져올 원칙:

- `pressure -> size`를 코드에 고정하지 않고 input/output curve로 일반화한다.
- random은 매 평가 때 바뀌는 값이되, 획 재생에서는 같은 값이어야 한다.
- smudge는 단일 숫자를 넘어 붓 안의 여러 위치가 서로 다른 색을 보유할 때 더 자연스럽다.
- 프리셋을 저장할 때 현재 엔진 버전과 값 스냅샷을 함께 보관해야 한다.

### 2.3 Krita

Krita의 Pixel Brush 문서는 brush tip, spacing, pressure/speed 등의 sensor가 dab의 크기·색·opacity를 바꾸는 구조를 설명한다. Color Smudge 엔진은 spacing이 tip 크기에 비례한다는 점과, 부드러운 smear에 충분히 작은 spacing이 필요하다는 점을 강조한다.

Krita preset은 preview, 엔진, 파라미터, tip, 가능한 경우 texture를 함께 보관한다. `.kpp`는 PNG 안의 annotation에 엔진 XML을 넣으며, MyPaint preset은 JSON과 별도 preview 이미지로 구성된다. 이 사실은 **미리보기, 설정, 종속 에셋을 논리적으로 분리하되 한 리소스 묶음으로 배포**해야 함을 보여준다.

### 2.4 Adobe Fresco

Fresco의 Live Oil UI는 복잡한 내부 모델을 `Size`, `Flow`, `Paint Mix`, `Brush Settings` 같은 소수의 사용자 제어로 압축한다. Flow는 붓에 공급되는 물감, Paint Mix는 새 색과 기존 색의 혼합 정도로 이해할 수 있다. Mixer Brush는 기존 캔버스 색을 섞는 역할을 분리한다.

우리에게 가져올 원칙:

- 플레이어 UI의 1차 조절은 크기, 물감량, 섞임, 안정화 정도면 충분하다.
- `pickup`, `drag`, `grain mode` 같은 값은 프리셋 제작 도구 안에 숨긴다.
- 사실적 시뮬레이션보다 사용자가 바로 이해하는 조작명이 더 중요할 때가 있다.

### 2.5 공통 패턴과 우리식 축소

| 공통 기능 | 완전형 앱 | 괴짜 복원소 v0.2 |
|---|---|---|
| 경로 리샘플링 | 다중 안정화·예측·보정 | One Euro + 거리 기반 dab |
| tip | 다중/색상/절차형 tip | primary + secondary grayscale mask |
| grain | 이동/고정/깊이/혼합 모드 | Moving, CanvasLocked |
| dynamics | 수십 입력×출력 | 7 input × 15 output 범용 modulator |
| paint reservoir | 공간적 다중 bucket | 획 진행도 기반 scalar load |
| wet mixing | 복수 레이어/고급 solver | color/material 2 RT와 pickup/drag |
| preview | 전용 실시간 pad | 실제 canvas를 쓰는 표준 stroke exporter |
| preset 포맷 | 독자 파일/번들 | ScriptableObject + Texture 참조 + stable ID |

---

## 3. 한 획이 만들어지는 정확한 순서

```text
OS/Pencil 입력
  -> 좌표 안정화
  -> 거리 기반 리샘플링
  -> DabContext 생성
  -> 프리셋 dynamics 평가
  -> 위치/각도/크기/색 확정
  -> tip × secondary tip × grain coverage
  -> 도포 또는 smudge/scrape
  -> color/material state 갱신
  -> 화면 shading
  -> 동일 DabContext를 history에 저장
```

### 3.1 왜 시간 간격이 아니라 거리 간격인가

프레임마다 stamp를 찍으면 120 Hz 기기와 60 Hz 기기에서 같은 손동작의 농도가 달라진다. 속도가 느릴 때는 물감이 과도하게 쌓이고 빠를 때는 점선이 된다. 따라서 다음 dab까지의 거리를 반경에 비례시킨다.

기본식:

```text
spacingPx = radiusPx / dabsPerRadius × spacingMultiplier
```

- `dabsPerRadius`가 클수록 촘촘하고 부드럽지만 GPU 비용과 paint accumulation이 늘어난다.
- v0.2는 압력과 spacing dynamics, 결정적 spacing jitter가 다음 간격에 영향을 줄 수 있다.
- 중형 유화 브러시 시작값은 `2.2–3.4 dabs/radius`가 무난하다.
- smudge는 끊김이 더 잘 보여 도포 브러시보다 촘촘한 간격이 필요하다.

### 3.2 DabContext에 반드시 들어가야 하는 것

```csharp
sample                 // 위치, 압력, tilt, twist, time
directionUv            // 직전 dab에서 현재 dab으로의 방향
speedPixelsPerSecond   // 시간 정규화된 속도
strokeDistancePixels   // 획 시작부터 이동 거리
strokeProgress01       // 끝 길이를 몰라도 쓸 수 있는 점근 진행도
dabIndex               // 0부터 증가하는 dab 번호
strokeSeed             // 랜덤 재현용 획 시드
```

최종 획 길이는 펜을 떼기 전까지 알 수 없다. 따라서 런타임 load 고갈에는 다음 점근 함수를 쓴다.

```text
progress = 1 - exp(-distance / progressDistance)
```

이 값은 정확한 퍼센트가 아니라 “얼마나 오래 끌었는가”를 안정적으로 나타내는 입력이다. 미리보기처럼 길이를 미리 아는 경우에는 0–1의 실제 `t`를 사용해도 된다.

---

## 4. Tip / Shape 설계와 제작법

### 4.1 좋은 tip이 갖춰야 할 것

- grayscale 또는 단일 채널: 흰색은 물감이 묻는 곳, 검정은 빈 곳
- 중앙 정렬과 충분한 투명 여백
- 가장자리에 완전한 직선 잘림이 없을 것
- 내부 강모 구멍과 가장자리 feather가 서로 다른 주파수를 가질 것
- 원본 해상도 512–1024 px, 런타임은 기기와 최대 브러시 크기에 맞춰 축소
- 색은 tip에 굽지 않는다. 현재 paint color가 mask를 착색한다.

### 4.2 실제 붓에서 캡처하는 권장 작업

1. 무광 검은 종이에 흰색 불투명 물감으로 한 번 눌러 찍는다.
2. 같은 붓을 가볍게, 중간, 강하게 눌러 여러 샘플을 만든다.
3. 균일한 확산광에서 RAW 또는 고해상도 사진을 촬영한다.
4. 원근과 렌즈 왜곡을 보정한다.
5. 흑백 변환 후 Levels로 배경을 0, 물감 덩어리를 1에 가깝게 만든다.
6. 작은 먼지는 제거하되 강모의 불규칙함은 남긴다.
7. 중앙을 맞추고 정사각형으로 패딩한다.
8. 단일 채널 PNG로 내보내고 Unity에서 mipmap을 끄고 Clamp를 사용한다.

### 4.3 수작업 tip을 만드는 법

실제 캡처가 어려우면 3층으로 합성한다.

- Macro silhouette: flat, filbert, round, knife의 전체 형태
- Meso bristles: 방향성 있는 길쭉한 흰 띠와 검은 틈
- Micro breakup: 작은 점·노이즈로 가장자리와 내부를 부분적으로 끊음

노이즈만 곱하면 “진짜 붓”이 아니라 스프레이처럼 보인다. 강모는 진행 방향과 관련된 긴 구조를 가져야 한다.

### 4.4 primary + secondary mask

v0.2 shader는 두 tip을 곱해 쓸 수 있다.

```text
finalTip = primary × lerp(1, secondary, secondaryStrength)
```

용도:

- primary: flat/filbert 같은 큰 외곽
- secondary: 강모 갈라짐, 중간의 끊긴 띠, 별도 질감
- secondary scale/angle: 반복 패턴이 외곽과 정확히 겹쳐 보이는 인공성을 완화

Photoshop의 dual brush처럼 두 형상이 동시에 존재하는 부분만 남기는 아이디어를 축소한 것이다. 첫 버전에서 두 tip 각각에 독립 scatter/count까지 넣을 필요는 없다.

---

## 5. Grain 설계

### 5.1 Moving grain

grain 좌표가 dab의 local UV를 따라간다. 붓 안의 페인트 덩어리, 스펀지 구멍, 나이프 자국처럼 **도구와 함께 이동하는 무늬**에 적합하다.

### 5.2 CanvasLocked grain

grain 좌표가 전체 캔버스 UV에 고정된다. 획을 겹쳐도 같은 돌출부와 골에서 물감이 걸리므로 **캔버스 천, 종이결, 오래된 바탕층**에 적합하다.

### 5.3 제작 규칙

- seamless tile을 만든다.
- 저주파 밝기 얼룩은 제거한다. 반복 타일의 경계가 없어야 한다.
- 유화 캔버스용은 실 방향 두 축과 작은 요철을 섞는다.
- 디테일을 너무 작게 만들면 mipmap/축소에서 회색으로 평균되어 효과가 사라진다.
- v0.2 shader는 `frac()`로 반복하므로 texture wrap 설정과 무관하게 타일링되지만, 원본 자체의 경계는 여전히 seamless여야 한다.

### 5.4 coverage grain과 height grain을 구분해야 한다

현재 구현은 grain을 coverage에 곱한다. 즉 결의 골에는 물감이 덜 묻는다. 최종 제품에서는 두 효과를 분리하는 것이 좋다.

- Coverage grain: 실제 색/질량이 묻는 양
- Height modulation: 같은 색이 묻어도 표면 높이만 달라짐
- Lighting grain: 원본 캔버스 normal/roughness에만 영향

세 값을 한 slider에 묶으면 dry brush는 만들기 쉽지만 rich oil의 매끈한 색과 거친 높이를 동시에 표현하기 어렵다.

---

## 6. Dynamics: 입력을 출력에 연결하는 법

### 6.1 제공 입력

| 입력 | 0–1 정규화 | 좋은 사용처 | 주의점 |
|---|---:|---|---|
| Pressure | Pencil 압력 | 크기, flow, thickness | 마우스/손가락 fallback 필요 |
| Speed | speed/range | flow, spacing, drag | 필터가 없으면 떨림 |
| Tilt | tilt vector 길이 | aspect, angle, 크기 | 기기별 범위 보정 |
| StrokeProgress | 점근 진행도 | load 고갈, fade | 실제 완료율이 아님 |
| RandomPerDab | 해시 random | 크기, 색, 각도 | 반드시 결정적이어야 함 |
| Direction | atan2를 0–1로 | flat brush angle | 저속 구간에서 불안정 |
| BarrelRoll | twist를 0–1로 | flat/knife 회전 | 지원 Pencil에서만 의미 있음 |

### 6.2 제공 출력

`Radius, Aspect, Rotation, Spacing, Flow, Thickness, Wetness, Pickup, Drag, Roughness, BristleStrength, Scatter, Hue, Saturation, Value`

### 6.3 조합 모드

```text
Multiply: current × lerp(1, curve(input), amount)
Add:      current + curve(input) × amount
Replace:  lerp(current, curve(input), amount)
```

예시:

- Pressure → Radius, Multiply, amount 1: 0.15에서 1.0으로 커짐
- Speed → Flow, Multiply: 빠르게 그을수록 공급량을 줄임
- Tilt → Aspect, Add: 눕힐수록 넓은 면이 닿음
- Random → Rotation, Add: dab마다 작은 각도 변화
- Progress → Flow, Multiply: 긴 획에서 물감이 고갈됨

### 6.4 curve를 튜닝하는 안전한 순서

1. 다른 dynamics를 전부 끈다.
2. 입력 0, 0.25, 0.5, 0.75, 1의 결과를 확인한다.
3. 최소값을 먼저 정한다. 0 압력에서 radius가 0이면 펜 다운이 끊겨 보인다.
4. 최대값을 정한다.
5. 중간 구간의 기울기로 손맛을 조절한다.
6. 다른 dynamics를 하나씩 켠다.

여러 modulator를 동시에 넣고 감으로 조절하면 어떤 값이 문제인지 찾기 어렵다. 프리셋 제작 중에는 항상 단일 변수 A/B 캔버스를 유지한다.

---

## 7. 결정적 랜덤이 필요한 이유와 구현

다음 코드는 금지한다.

```csharp
float jitter = UnityEngine.Random.value;
```

이 값은 전역 상태에 의존하므로 다음 상황에서 획이 바뀐다.

- Undo 후 명령 재생
- 저장 문서 다시 열기
- 고해상도 export를 위한 재렌더
- 네트워크/리플레이 동기화
- 미리보기와 실제 캔버스 비교

v0.2는 `strokeSeed`, `dabIndex`, `channel`을 정수 hash에 넣는다.

```csharp
float r = OilPaintDeterministicRandom.Value01(strokeSeed, dabIndex, channel);
```

channel을 분리하면 같은 dab의 radius random과 color random이 우연히 똑같이 움직이지 않는다. 프리셋 필드를 추가해도 기존 channel 번호를 바꾸지 않아야 과거 획의 모양이 유지된다.

저장 문서에는 다음 중 하나가 필요하다.

- 모든 `OilPaintDabContext` 저장
- raw sample + resampler 버전 + preset 값 snapshot + stroke seed 저장

프로토타입은 첫 번째가 단순하고 안전하다. 제품 단계에서는 checkpoint texture와 명령 stream을 함께 써서 시작 시간을 줄인다.

---

## 8. Paint Interaction 설계

### 8.1 사용자가 보는 값과 엔진 값

| 사용자 표현 | 내부 값 후보 |
|---|---|
| 물감량 | flow + initialLoad |
| 두께 | thickness |
| 섞임 | pickup + drag |
| 촉촉함 | wetness |
| 붓결 | bristleStrength + tip/grain |
| 마름 | canvas drying + roughness |

### 8.2 Flow와 Load를 분리한다

- Flow: dab 한 번이 내놓을 수 있는 비율
- Load: 한 획 전체에서 쓸 수 있는 물감의 잔량

v0.2의 단순식:

```text
remainingLoad = clamp01(initialLoad - progress × loadDepletion)
effectiveFlow = flow × lerp(1, remainingLoad, loadAffectsFlow)
```

이 모델은 공간적 붓 저장소가 아니므로, 붓의 왼쪽은 빨간색이고 오른쪽은 파란색인 상태를 표현하지 못한다. 하지만 dry brush의 고갈, 긴 획 끝의 옅어짐, 다시 펜을 대면 충전되는 감각은 매우 싸게 만든다.

### 8.3 Pickup과 Drag

- Pickup은 기존 캔버스 색이 새로 들어오는 색에 섞이는 비율이다.
- Drag는 진행 방향의 이전 픽셀을 현재 위치로 끌어오는 비율이다.
- 둘을 같이 높이면 blender/mixer가 된다.
- dry brush는 pickup과 drag를 낮추고 grain/bristle breakup을 높인다.
- palette knife는 높은 thickness, 낮은 bristle, 높은 hardness, 넓은 aspect가 핵심이다.

### 8.4 다음 단계: 공간적 reservoir

최종 품질을 한 단계 올릴 때는 붓 아래 작은 2D pickup map을 둔다.

```text
brush reservoir texel:
  RGB = 붓이 보유한 색
  A   = 해당 위치의 물감량
```

각 dab에서:

1. reservoir 일부를 캔버스에 내려놓는다.
2. 젖은 캔버스 색 일부를 reservoir로 가져온다.
3. 강모 방향으로 reservoir 내부를 약간 확산/이동한다.

이 방식은 전체 3D bristle simulation보다 훨씬 싸면서, multicolor pickup과 자연스러운 color streak를 만든다. v0.3의 가장 가치 있는 R&D 후보지만 v0.2의 필수 조건은 아니다.

---

## 9. 프리셋 미리보기는 기능의 일부다

### 9.1 표준 stroke

좋은 미리보기는 예쁜 낙서가 아니라 비교 가능한 테스트다.

- 같은 길이와 위치
- 같은 기본 색
- 압력 약 → 강 → 약
- 약한 곡률로 방향 반응 노출
- 고정된 tilt와 seed
- 같은 배경과 crop

v0.2 `Brush Preview Studio`는 96 dab, 고정 seed, 좌우 표준 stroke를 실제 compute canvas에 찍는다. stamp형 preset은 중앙에 한 번 찍는다.

### 9.2 현재 도구의 한계

현재 PNG exporter는 `PaintTexture`의 straight color/coverage를 밝은 배경 위에 합성한다. material height를 조명하는 `OilPaintSurface.shader`까지 렌더하지 않으므로 **impasto 광택과 그림자**는 썸네일에 충분히 보이지 않는다.

제품 단계 개선:

1. preview 전용 Quad, orthographic camera, 고정 HDRI/2-light setup 구성
2. PaintTexture와 MaterialTexture를 surface material에 연결
3. 같은 카메라에서 RenderTexture로 촬영
4. highlight가 잘 보이는 약간 비스듬한 key light 사용
5. 색 미리보기와 relief 미리보기 두 장을 내부 QA에 저장

사용자용 타일은 하나여야 하지만 제작자는 coverage와 height를 따로 검사해야 한다.

### 9.3 메타데이터

필수:

- stable ID
- schema version
- display name, description
- category, tags
- preview texture, preview mode
- 종속 tip/grain asset

게임 진행으로 브러시를 해금할 경우 저장 데이터는 library index가 아니라 stable ID를 보관한다. 정렬 순서가 바뀌어도 해금 상태가 망가지지 않는다.

---

## 10. v0.2 코드 구조

| 파일 | 책임 |
|---|---|
| `OilPaintDabContext.cs` | dab의 입력·속도·진행도·seed와 hash random |
| `OilPaintBrushDynamics.cs` | input/output modulator와 curve 평가 |
| `OilPaintBrushPreset.cs` | versioned recipe, tip/grain, paint, preview metadata |
| `OilPaintBrushLibrary.cs` | 브러시 shelf 순서·노출·stable ID 검색 |
| `OilPaintStrokeResampler.cs` | 동적 spacing의 거리 기반 dab 생성 |
| `OilPaintInputController.cs` | speed/distance/progress/index/seed 계산 |
| `OilPaintCanvas.cs` | 평가된 dab을 compute shader에 전달 |
| `OilPaint.compute` | primary/secondary tip, grain, paint interaction |
| `OilPaintHistory.cs` | DabContext 전체를 저장하고 결정적으로 replay |
| `OilPaintDefaultPresetFactory.cs` | 8종 starter asset 자동 생성 |
| `OilPaintBrushPreviewStudio.cs` | 실제 엔진 표준 stroke와 PNG 생성 |
| `OilPaintBrushPresetEditor.cs` | Inspector preview와 제작 도구 진입점 |

### 10.1 프로젝트에 넣는 순서

1. v0.2 `UnityPackage`를 Unity 프로젝트 `Packages` 아래에 복사한다.
2. 기존 v0.1 컴포넌트의 missing script 여부를 확인한다.
3. `OilPaint.compute`를 Canvas에 연결한다.
4. 메뉴 `Tools > Weird Restoration > Create Starter Brush Library`를 실행한다.
5. 생성된 8개 preset에 tip/grain texture를 연결한다.
6. 테스트 scene에 preview 전용 `OilPaintCanvas`를 둔다.
7. `Brush Preview Studio`에서 각 preview를 생성한다.
8. 실제 iPad에서 압력과 tilt를 튜닝한다.

### 10.2 런타임에서 프리셋을 수정할 때

ScriptableObject 원본을 직접 변경하면 모든 문서와 사용자가 영향을 받는다. 사용자 slider가 필요하면 다음 중 하나를 쓴다.

- preset을 `Instantiate()`해 세션 사본을 만든다.
- `BrushRuntimeOverrides` 구조체에 size/flow/mix만 저장하고 평가 뒤 적용한다.
- 문서 저장 시 preset stable ID + override만 기록한다.

원본 preset은 제작 기준값으로 취급한다.

---

## 11. 2인 팀이 실제로 튜닝하는 방법

### 역할 A: 엔진·도구

- input trace와 dab debugger
- preset inspector와 preview pipeline
- GPU timing, dirty rect, 메모리
- 저장/replay 결정성
- reservoir 실험

### 역할 B: 브러시·콘텐츠

- 실제 tip/grain 촬영 및 정리
- preset별 용도 정의
- 동일 과제 A/B 테스트
- 명화별 추천 brush set
- 튜토리얼과 해금 순서

둘이 매일 함께 해야 하는 것은 “코드 리뷰”보다 **같은 5개 테스트 획을 같은 기기에서 그려 결과를 비교하는 15분 세션**이다.

### 표준 5개 테스트 획

1. 일정 압력 직선: spacing과 banding
2. 약→강→약 선: pressure curve
3. 빠름→느림 선: speed dynamics와 paint density
4. S 곡선: angle 추종과 안정화
5. 기존 두 색 경계 횡단: pickup/drag/mixing

각 preset은 이 다섯 획과 실제 복원 task 두 개를 통과해야 배포한다.

---

## 12. 품질 지표와 실패 패턴

| 문제 | 보이는 증상 | 가장 먼저 볼 값 |
|---|---|---|
| Stamp banding | 원/사각 stamp가 줄지어 보임 | spacing, dabsPerRadius |
| 뭉침 | 느린 구간만 지나치게 진함 | flow, accumulation, speed→flow |
| 털 떨림 | 가장자리 노이즈가 계속 춤춤 | random seed, angle, tracking |
| 플라스틱 | 두껍지만 모두 매끈함 | height, roughness, light |
| 스프레이 느낌 | 방향 없는 점 노이즈 | tip의 meso bristle 구조 |
| 스티커 느낌 | tip 외곽이 매번 동일 | rotation/flip/secondary mask |
| 색 진흙화 | 조금만 섞어도 회갈색 | pigment mixing, pickup |
| smudge 끊김 | 드래그가 계단처럼 보임 | spacing, upstream sample |
| 썸네일 불일치 | 타일과 실제 획 느낌이 다름 | preview가 같은 엔진인지 |
| Undo 변화 | 되돌린 뒤 질감 위치가 달라짐 | global random 사용 여부 |

정량 로그:

- dab count / stroke
- compute dispatch ms 평균·P95
- dirty rect pixel 수
- input-to-photon latency
- active RT memory
- replay 결과의 pixel hash
- thermal state별 5분 지속 FPS

---

## 13. 성능 예산

브러시 preset 자체보다 `반경 × dab 밀도 × shader 비용`의 곱이 성능을 결정한다.

대략적인 상대 비용:

```text
cost ∝ dabCount × dirtyRectArea × kernelComplexity
dirtyRectArea ∝ radius² × aspect
```

따라서 radius를 2배로 하면 dab 간격도 커지지만 한 dab의 영역은 최대 4배가 된다. 넓은 palette knife는 aspect 때문에 더 비싸다.

모바일 최적화 우선순위:

1. dirty rectangle dispatch 유지
2. 보이지 않는 predicted sample은 history에 넣지 않기
3. smudge의 upstream 탐색 반경 제한
4. grain/tip texture 포맷과 bandwidth 점검
5. 같은 preset에서 material keyword 폭증 방지
6. 아주 큰 브러시는 저해상도 simulation layer를 검토

미리보기는 에디터 도구이므로 CPU downsample이 허용되지만, 런타임 brush shelf에서 즉석 생성하지 않는다. 빌드에는 미리 생성된 작은 PNG만 넣는다.

---

## 14. 복원 게임에 맞춘 제품 규칙

### 14.1 자유도가 커져도 선택은 작아야 한다

캔버스 절반을 그릴 수 있어도 한 스테이지에서 40개 브러시를 모두 보여주면 복원보다 도구 탐색이 주가 된다.

권장:

- 기본 shelf: 5–8개
- 작품별 추천 3개를 상단에 고정
- 전체 라이브러리는 별도 drawer
- 마지막 사용, 즐겨찾기, 작품 추천을 분리
- 고급 slider는 자유 그리기 모드에서만 노출

### 14.2 난이도를 브러시 부족으로 만들지 않는다

어려운 단계라고 불편한 브러시만 주면 조작 스트레스가 된다. 난이도는 다음으로 만든다.

- 결 방향과 형태를 읽어야 하는 손상 부위
- 색을 관찰하고 섞어야 하는 팔레트
- 보존 영역을 건드리지 않는 정교함
- wet-on-wet과 dry-over-wet의 순서
- 제한된 undo나 시간은 선택적 challenge로만 사용

### 14.3 그림 앱 바이럴을 위한 조건

- 복원 외 자유 캔버스에서 같은 엔진 사용
- PNG/타임랩스 export
- 최소 5개 brush가 독립적으로 작품을 완성할 수준
- 이름보다 획 preview로 선택 가능
- 사용자가 만든 preset 공유는 엔진 안정화 후 도입
- brush마다 “이것으로 무엇을 그릴 수 있는가”가 명확해야 함

프리셋 수가 아니라 **Rich Oil 하나로 20분 그려도 질리지 않는가**가 먼저다.

---

## 15. 구현 로드맵

### 단계 1 — v0.2를 실제 Unity에서 컴파일 (1–2일)

- Unity 6 프로젝트에 패키지 복사
- Metal/Editor compute shader compile
- 8 preset asset 생성
- input/history event 변경에 따른 프로젝트 코드 수정
- Android/Windows는 범위 밖이면 명시적으로 제외

완료 조건: Editor와 iPad 빌드에서 console error 0.

### 단계 2 — tip/grain 에셋 스프린트 (3–5일)

- flat, filbert, round, broken, knife tip 제작
- canvas fine/coarse grain 2종
- 모든 원본/가공 파일의 라이선스와 출처 기록
- 8 preset에 할당하고 표준 preview 생성

완료 조건: 흰 texture fallback을 쓰는 출시 후보 preset 0개.

### 단계 3 — 손맛 튜닝 (1주)

- 5개 표준 획 자동/수동 캡처
- pressure min/max와 speed range를 실기기별 보정
- 각 preset의 role이 겹치면 하나를 제거하거나 명확히 분화
- 30분 자유 그리기 세션에서 피로와 반복 패턴 기록

완료 조건: 비전문 사용자도 blind test에서 주요 preset을 구분.

### 단계 4 — material preview와 저장 결정성 (3–5일)

- surface shader까지 포함한 preview camera
- stroke replay pixel hash 테스트
- preset value snapshot 또는 버전 migration 구현
- checkpoint + command stream undo 설계

완료 조건: 같은 문서를 두 번 replay했을 때 동일 hash.

### 단계 5 — reservoir R&D gate (3–7일 실험)

- 32×32 또는 64×64 brush reservoir 한 개
- canvas↔brush 양방향 색 교환
- 기존 scalar load와 화질/성능 blind comparison
- 이득이 작거나 프레임 예산을 넘으면 제품 범위에서 제외

완료 조건: Rich Oil/Blender에서 눈에 띄는 multicolor streak가 생기고 목표 iPad에서 예산 내.

### 단계 6 — 게임 통합

- 작품별 추천 brush set
- 복원 scoring과 protected area
- free canvas와 export
- onboarding: pressure, mix, dry brush 순서
- analytics: preset 선택률, 평균 사용 시간, 이탈 지점

---

## 16. 지금 하지 말아야 할 것

- 처음부터 Art Set 4 전체 브러시 수를 재현
- 3D 강모 수천 개를 모바일에서 직접 시뮬레이션
- 프리셋마다 별도 shader variant 생성
- 사용자 preset marketplace를 엔진 안정화 전에 구축
- AI가 프레임마다 브러시 결과를 생성하게 함
- 저작권이 불분명한 상용 앱 tip PNG를 추출해 사용
- 썸네일을 손으로 그려 실제 획보다 좋게 보이게 만들기

AI는 preset 추천, 이름/태그, 참조 사진에서 초기 tip 후보 생성, QA 로그 분석에 쓸 수 있다. 그러나 실시간 획 렌더의 핵심은 지연과 재현성 때문에 로컬 GPU의 결정적 브러시 엔진이어야 한다.

---

## 17. 코드의 현재 한계와 다음 수정 포인트

1. `speedPixelsPerSecond`는 첫 dab과 같은 timestamp 구간에서 순간값이 클 수 있다. 제품에서는 speed에도 별도 low-pass가 필요하다.
2. `strokeProgress01`은 점근값이다. 실제 끝 비율이 필요한 post-process dynamics에는 전체 stroke 재생 시 재계산한다.
3. color dynamics는 HSV 기반이다. 물리 안료 혼색과 별개의 스타일 변화다.
4. load는 scalar다. 공간적 multicolor reservoir가 아니다.
5. grain은 coverage에만 적용된다. height/roughness grain을 분리해야 한다.
6. preview PNG는 material lighting을 포함하지 않는다.
7. history는 preset asset 참조를 저장한다. preset이 바뀌면 옛 획도 바뀐다. 출시 전 value snapshot이 필요하다.
8. `OnValidate` stable ID는 asset duplicate 정책을 더 엄격히 해야 한다. 복제 시 새 ID 발급 메뉴를 제공하는 편이 안전하다.
9. v0.2는 정적 검토용 코드이며 Unity Editor와 iPad 실기기 컴파일/성능 검증이 남아 있다.

이 한계를 문서에 명시하는 이유는 prototype을 production-ready로 오해하지 않기 위해서다.

---

## 18. 1차 자료와 라이선스 메모

### 공식 제품 문서

- Procreate Handbook, Brush Studio Settings  
  https://help.procreate.com/procreate/handbook/brushes/brush-studio-settings
- Adobe Fresco, Live brushes  
  https://helpx.adobe.com/fresco/using/live-brushes.html
- Adobe Fresco, realistic oil painting and color mixing  
  https://helpx.adobe.com/fresco/how-to/realistic-oil-painting.html
- Krita Manual, Brush Tips  
  https://docs.krita.org/en/reference_manual/brushes/brush_settings/brush_tips.html
- Krita Manual, Pixel Brush Engine  
  https://docs.krita.org/en/reference_manual/brushes/brush_engines/pixel_brush_engine.html
- Krita Manual, Color Smudge Brush Engine  
  https://docs.krita.org/en/reference_manual/brushes/brush_engines/color_smudge_engine.html
- Krita Manual, Brush Preset resource format  
  https://docs.krita.org/en/reference_manual/resource_management/paintoppresets.html
- Unity Scripting API, Editor.OnPreviewGUI  
  https://docs.unity3d.com/6000.4/Documentation/ScriptReference/Editor.OnPreviewGUI.html
- Unity Scripting API, Editor.RenderStaticPreview  
  https://docs.unity3d.com/ScriptReference/Editor.RenderStaticPreview.html

### 오픈소스 1차 자료

- libmypaint repository  
  https://github.com/mypaint/libmypaint
- libmypaint brush setting/input schema  
  https://github.com/mypaint/libmypaint/blob/master/brushsettings.json
- libmypaint mapping API  
  https://github.com/mypaint/libmypaint/blob/master/mypaint-brush.h

libmypaint는 ISC 라이선스이지만 이 패키지의 코드는 해당 구현을 복사하지 않고 개념을 참고해 새로 작성했다. Krita 코드는 GPL이므로 직접 가져오지 않았다. 상용 앱의 브러시 파일·tip 이미지도 추출하거나 배포하지 않는다. 제품에 들어갈 tip/grain은 자체 제작하거나 명시적 상업 이용 라이선스를 확보해야 한다.

---

## 19. 최종 판단

이 프로젝트에서 브러시 프리셋 제작은 “엔진이 다 된 뒤 콘텐츠를 채우는 일”이 아니다. 엔진 요구사항을 발견하는 가장 빠른 테스트이자 사용자가 품질을 판단하는 첫 화면이다.

우선순위는 다음과 같다.

1. 8개 starter 중 Rich Oil, Dry Oil, Flat Hog, Blender 네 개를 먼저 완성한다.
2. 실제 tip/grain과 표준 preview를 만든다.
3. iPad에서 5개 표준 획과 30분 자유 그리기로 튜닝한다.
4. 그 네 개가 설득력 있을 때 Detail, Filbert, Broken, Knife를 완성한다.
5. 그래도 색 pickup이 단조로울 때만 spatial reservoir를 만든다.

프리셋 100개보다, 용도가 다르고 손의 반응이 분명한 8개가 이 게임에는 더 강하다.
