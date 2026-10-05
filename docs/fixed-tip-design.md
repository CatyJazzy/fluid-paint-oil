# 고정 붓 형태로 가는 설계

포크(dli/paint)에서 **물감의 질감과 색 섞임은 남기고, 붓털 시뮬레이션은 버린다.**
붓 모양은 고정된 마스크 한 장으로 찍는다.

근거는 `docs/research/`의 조사 문서 세 편과, 그 문서가 가리키는 1차 자료를 직접 읽은 결과다.
읽은 자료와 거기서 가져온 것은 §4에 적는다.

---

## 1. 무엇을 남기고 무엇을 버리는가

| 포크의 구성 요소 | 처리 | 이유 |
| --- | --- | --- |
| 유체 시뮬레이션 (`advect`·`divergence`·`jacobi`·`project`·`subtract`) | **남김** | 물감이 섞이고 끌리는 감각이 여기서 나온다 |
| 한 장짜리 물감 텍스처 (rgb=색, a=두께)와 분리 블렌딩 | **남김** | 색은 덮이고 두께는 쌓인다. 임파스토의 근간 |
| 두께 소벨 → 법선 → GGX 조명 (`painting.frag`) | **남김** | 물감의 질감이 보이는 곳 |
| RYB 색 공간과 `rybToRgb` | **남김** | 섞을 때 물감처럼 도는 이유 |
| 붓털 위치 텍스처와 PBD 솔버 (`setbristles`·`distanceconstraint`·`bendingconstraint`·`planeconstraint`·`project`·`updatevelocity`) | **버림** | 붓 모양이 매 프레임 달라지는 원인 |
| 붓털 궤적 스플랫 (`splat.vert`의 positionsTexture 참조) | **교체** | 붓털 N가닥의 캡슐 → 고정 마스크 한 번 |
| 붓 커서 와이어프레임 (`brush.frag`/`brush.vert`) | **버림** | 붓털이 없으므로 의미가 없다 |

조사 문서 `RESEARCH_REPORT_KO.md` §2가 같은 결론을 먼저 적어 두었다 —
**캔버스 물성에 계산을 쓰고, 붓 모양은 좋은 데이터로 속인다.**
Stuyck의 모바일 논문도 유체는 풀되 붓은 texture stamp로 단순화했다.

---

## 2. 고정 붓을 정의하는 값

libmypaint의 65개 setting 중 우리에게 필요한 최소 집합만 가져온다.
이름은 원본을 따른다 — 나중에 다른 엔진으로 옮길 때 대조가 되기 때문이다.

### 2.1 모양 (한 dab)

| 값 | 출처 | 뜻 |
| --- | --- | --- |
| `radius` | libmypaint `radius_logarithmic` | 붓 반지름 |
| `ellipticalDabRatio` | libmypaint `elliptical_dab_ratio` (1–10) | 납작한 정도. **이 값이 고정 붓 모양의 핵심이다** |
| `ellipticalDabAngle` | libmypaint `elliptical_dab_angle` (0–180°) | 붓을 눕힌 각. 고정이면 납작붓, 진행 방향 추종이면 둥근붓 |
| `hardness` / `softness` | libmypaint | 가장자리가 떨어지는 방식 |
| `tipMask` | Krita "Alpha Mask" 예정 | 회색조 마스크. 흰색이 묻는 곳 |

Krita의 predefined brush는 회색조 tip을 전경색으로 착색하는 **Alpha Mask** 모드를 쓴다.
우리도 같다 — 색은 마스크에 굽지 않는다.

### 2.2 간격

```
spacing = radius / dabsPerRadius
```

- libmypaint: `dabs_per_basic_radius`, `dabs_per_actual_radius`, `dabs_per_second` 세 갈래
- 조사 문서 §3.1: 중형 유화는 **2.2–3.4 dabs/radius**가 무난
- Krita Color Smudge: **smear 계열은 간격을 낮게** 둬야 결이 거칠어지지 않는다 (둥근붓 0.05 이하 권장)

프레임마다 찍지 않고 **거리로 다시 샘플링**한다. 지금 포크는 프레임 기반이라
120Hz와 60Hz에서 같은 손동작의 농도가 달라진다.

### 2.3 쌓임 보정

libmypaint에 `opaque_linearize`가 있다 —
"여러 dab을 겹쳐 블렌딩할 때 생기는 비선형을 보정한다".
간격을 촘촘히 두면 한 획 안에서 같은 자리가 여러 번 덮이므로 이 보정이 필요하다.

### 2.4 섞임 (붓털 픽업을 대신할 것)

붓털마다 물감을 들고 있던 구조를 버리므로, 색 섞임은 smudge 모델로 옮긴다.

| 값 | 출처 | 뜻 |
| --- | --- | --- |
| `smudge` | libmypaint | 붓 색 대신 집어 온 색으로 칠하는 비율 |
| `smudgeLength` | libmypaint `smudge_length` | 집어 온 색이 캔버스 색으로 바뀌는 속도. 0이면 즉시 |
| `smudgeRadius` | libmypaint `smudge_radius_log` | 색을 집어 오는 원의 반지름 |
| `smudgeBucket` | libmypaint `smudge_bucket` (256칸) | **붓이 여러 색을 동시에 들고 있게 하는 값** |

`smudge_bucket`이 중요하다. 붓털 하나하나를 시뮬레이션하지 않고도
"붓의 이쪽은 빨강, 저쪽은 파랑" 상태를 만드는 libmypaint의 답이다.
공간적 reservoir보다 훨씬 싸다.

Krita는 같은 일을 두 모드로 나눈다.

- **Smearing** — 직전 붓 자리 아래를 그대로 새 자리에 복사한다. 문서가 "유화 임파스토를 닮는다"고 적는다
- **Dulling** — smudge 반지름 안의 색을 뽑아 dab 전체를 채운 뒤 전경색을 Color Rate만큼 더한다

Procreate의 Wet Mix는 같은 모델의 사용자 이름이다 —
Dilution(희석), Charge(붓에 실린 양), Attack(캔버스에 붙는 양), Pull(끌고 가는 힘).

### 2.5 입력 → 출력 연결

libmypaint는 입력 18개 × 출력 65개의 범용 매핑을 쓴다. 우리는 먼저 이만큼만 연다.

| 입력 | 출력 | 시작값 |
| --- | --- | --- |
| pressure | radius | 0.15 → 1.0 |
| pressure | opaque | 0.10 → 1.0 |
| pressure | 두께 | 0.15 → 1.0 |
| speed1 | opaque | 빠를수록 줄임 |
| stroke (진행도) | 붓에 남은 양 | 길게 그을수록 마름 |
| direction | `elliptical_dab_angle` | 추종 비율로 조절 |
| tilt_declination | `elliptical_dab_ratio` | 눕히면 넓은 면 |
| random | radius·angle | dab마다 미세 변화 |

`stroke` 입력의 정의가 중요하다. 획이 언제 끝날지 모르므로 조사 문서 §3.1의 점근식을 쓴다.

```
progress = 1 - exp(-distance / progressDistance)
```

### 2.6 선 안정화

1€ 필터를 쓴다. 저속에서 cutoff를 낮춰 떨림을 잡고, 고속에서 올려 지연을 줄인다.

```
fc = fcmin + beta × |velocity|
```

튜닝 순서는 원저자 권고를 따른다 — `beta = 0`으로 두고 `fcmin`을 내려 떨림을 없앤 뒤,
빠르게 그으며 `beta`를 올려 지연을 줄인다. beta는 0.001, 0.0001 같은 크기에서 시작한다.

---

## 3. 색 섞임을 더 밀 때

포크는 지금 RYB 삼각보간으로 섞는다. 그럴듯하지만 물리 모델은 아니다.
한 단계 올린다면 **Spectral.js**가 가장 가까운 선택이다.

- White·Cyan·Magenta·Yellow·Red·Green·Blue **7개 기본 반사율 곡선**의 가중합으로 RGB를 스펙트럼으로 올린다 (Scott Burns의 LHTSS 변형)
- 380–750 nm를 **10 nm 간격 38밴드**로 다룬다
- 산란 계수를 고정한 **단일 상수 Kubelka–Munk**로 섞는다
- 유효 농도 `C = f² · T² · L` (L 광도, T 착색력, f 혼합 비율)
- 색역 밖은 OKLCh 채도 감소 + OKLab ΔE 최적화로 되돌린다
- **MIT 라이선스** — 가져다 쓸 수 있다

libmypaint에도 같은 축이 있다 — `paint_mode`, "감산 스펙트럼 혼색 모드. 0이면 안 섞고 1이면 스펙트럼만".

단, 조사 문서 §17 위험 2를 같이 본다. 물리적으로 정확한 혼색이
자유 색 선택 환경에서는 오히려 "색이 탁해지는 버그"로 읽힐 수 있다.
일반 모드와 나란히 두고 블라인드 비교를 한 뒤 기본값을 정한다.

---

## 4. 직접 읽은 1차 자료와 가져온 것

| 자료 | 가져온 것 |
| --- | --- |
| [libmypaint `brushsettings.json`](https://github.com/mypaint/libmypaint/blob/master/brushsettings.json) | 입력 18개·설정 65개 전체 스키마. `elliptical_dab_ratio/angle`, `dabs_per_*`, `opaque_linearize`, `smudge_*`, `smudge_bucket`, `paint_mode` |
| [Krita Pixel Brush Engine](https://docs.krita.org/en/reference_manual/brushes/brush_engines/pixel_brush_engine.html) | tip → spacing → sensor → blend 의 4단계 구조 |
| [Krita Brush Tips](https://docs.krita.org/en/reference_manual/brushes/brush_settings/brush_tips.html) | Alpha Mask 모드, ratio/angle/fade, auto spacing |
| [Krita Color Smudge Engine](https://docs.krita.org/en/reference_manual/brushes/brush_engines/color_smudge_engine.html) | Smearing vs Dulling, smudge radius(최대 300%), Color Rate, **smear는 간격을 낮게** |
| [Procreate Brush Studio](https://help.procreate.com/procreate/handbook/brushes/brush-studio-settings) | Stroke Path / Shape / Grain / Wet Mix 구획. Wet Mix의 Dilution·Charge·Attack·Pull |
| [Spectral.js](https://github.com/rvanwijnen/spectral.js) | 7 기본 곡선, 38밴드, 단일상수 K–M, `C=f²T²L`, MIT |
| [1€ Filter](https://gery.casiez.net/1euro/) | `fc = fcmin + beta·|velocity|`, 튜닝 순서 |

라이선스: libmypaint(ISC)와 Krita(GPL)의 **코드는 가져오지 않는다.** 개념과 파라미터 의미만 참조한다.
Spectral.js는 MIT라 실제로 넣을 수 있다. 포크 본체(dli/paint)도 MIT다.

---

## 5. 구현 순서

1. **거리 리샘플링** — 프레임 기반 갱신을 `spacing = radius / dabsPerRadius`로 바꾼다
2. **고정 tip으로 스플랫 교체** — `splat.vert`가 붓털 텍스처 대신 dab 하나의 사각형을 펼치고,
   `splat.frag`가 선분 거리 대신 **tip 마스크**를 읽는다. 타원 비율과 각도를 여기서 적용
3. **붓털 솔버 제거** — `brush.js`와 제약 셰이더 6장, 붓 커서 삭제
4. **1€ 필터** — 입력 경로에 붙인다
5. **압력·기울기** — 포인터 이벤트로 받아 §2.5의 매핑에 연결
6. **smudge 모델** — 붓털 픽업을 `smudge`/`smudgeLength`/`smudgeRadius`로 대체 ✅

   물감 텍스처는 렌더 타깃으로 쓰는 중에 같이 읽을 수 없다. `readPixels`로 CPU에
   내리면 매 프레임 파이프라인이 멈추므로(WebGL1에는 비동기 readback이 없다),
   찍기 **전에** 1×1 텍스처에 붓 아래 색을 적어 두는 별도 패스를 둔다.
   자기 자신을 읽으며 쓰므로 두 장을 번갈아 쓴다.

   `smudgeLength`는 **dab 하나당** 감쇠다. 반지름당 dab이 2.8개이므로 0.5 같은 값은
   반 붓너비도 못 가서 색을 잊는다. 붓너비 w만큼 끌고 가려면

   ```
   L = 0.5 ^ (1 / (2 · dabsPerRadius · w))
   ```

   w=1이면 0.88, w=3이면 0.96. 프리셋은 이 범위에 둔다.

   한 프레임에 dab이 몇 개 쌓이는지는 프레임레이트와 손 속도에 달렸으므로,
   획을 최대 4구간으로 나눠 집어 오고 각 구간에 `L^(dab수/구간수)`를 준다.
   같은 지수 감쇠를 n번 적용한 것과 `L^n`이 같다는 성질을 쓴다.

   아직 안 한 것: `smudge_bucket`(256칸). 붓이 색 하나만 문다.
   붓의 이쪽은 빨강, 저쪽은 파랑 같은 상태는 못 만든다.
7. **프리셋 재정리** — `BRUSH_PRESET_SPEC_TABLE_KO.md`의 8종 ✅

   사양표의 열이 전부 엔진 값에 자리를 잡았다.

   | 사양표 열 | 엔진 |
   | --- | --- |
   | Radius / Aspect / Hard / Bristle / Dabs\_R | 그대로 |
   | Flow | `alpha` (dab 하나의 색 농도) |
   | **Thick** | `thick` → 두께 전용 패스의 배율 |
   | Wet | `fluidity` = 0.60 + Wet × 0.30 |
   | Pickup | `smudge` |
   | **Drag** | `drag` → 유체를 미는 힘 |
   | Rough | `grain` |

   Blender 만 사양표(Thick 0)를 안 따른다. 0 이면 문지른 자리에서 두께가
   빠지기만 해서 구멍이 된다. 0.10 을 준다.

---

## 6. 두께와 색 농도를 떼어 놓는다

7번을 하다 원본과 나란히 놓고 재 보니 **유화 질감이 거의 사라져 있었다.**
같은 획에서 물감 두께가 원본의 1/3 (중앙값 3.2 대 9.5), 기본 광택은 거의 무광
(거칠기 0.46 대 원본 0.075). 평평한 면에 결만 얹히니 크레용으로 보였다.

원인은 한 장짜리 물감 텍스처의 구조다. `a` 채널이 **두께이면서 동시에 색을 덮는
비율**이다. 원본은 붓털 100 가닥이 각각 0.025 씩 얹어 색은 부드럽게 겹치고
두께는 크게 쌓았다. 고정 붓은 한 번에 찍으므로 그 둘을 한 값으로 낼 수 없다 —
두께를 올리려고 값을 키우면 dab 하나가 색을 통째로 덮어 버린다.

그래서 패스를 나눈다.

- 색 패스: `blendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ZERO, ONE)` — 두께를 안 건드린다
- 두께 패스: `colorMask(0,0,0,1)` + `blendFunc(ONE, ONE)` — a 채널에만 더한다

떼어 놓고 나니 색 농도를 따로 올릴 수 있게 됐다. 묶여 있을 때는 한 획을 그어도
색이 제 농도의 40% 밖에 안 올라왔다 (지금 80%).

두께 패스는 색과 두 가지를 다르게 본다.

1. **고랑을 더 깊게 판다** (`pow(shape, 2.4)`). 색에서까지 깊게 파면 붓털 사이로
   캔버스가 비쳐 크레파스가 된다. 두꺼운 물감의 붓자국은 물감 표면의 골이지
   캔버스까지 뚫린 구멍이 아니다. pow 는 덤으로 가장자리를 세워 획 테두리에
   하이라이트가 걸리는 둔덕을 만든다.
2. **캔버스 결을 거의 뺀다** (30%). 결까지 증폭하면 긴 고랑이 아니라 사포처럼
   잘게 반짝인다. 결은 물감이 덜 묻는 층이지 물감 표면을 깎는 층이 아니다.

### 붓결은 한 획 동안 이어져야 한다

두께를 올려도 여전히 평평했다. 절대 높이가 아니라 **작은 스케일의 기울기**가
문제였다. dab 마다 tip 아틀라스 변형과 흔들림을 새로 뽑고 있었는데, 그러면
골 위치가 매번 달라져 겹칠 때 서로를 메운다.

붓털은 한 획 내내 같은 자리를 긁는다. 그래서

- tip 변형은 **획마다 하나** 고른다 (dab 마다가 아니라)
- 진행 방향과 수직인 흔들림(골을 옆으로 뭉개는 것)은 백색잡음이 아니라 천천히 도는 값
- 진행 방향 성분만 백색잡음으로 둔다

이게 격자무늬를 다시 부르지는 않는다. 반지름 흔들림과 저주파 위치 흔들림이 남아 있다.

1–3이 끝나면 "붓 모양이 고정된 채로 그려진다"가 달성된다. 나머지는 손맛 작업이다.


---

## 7. 레퍼런스 영상에서 읽은 것

실제 앱으로 그린 영상을 프레임 단위로 확대해 보고 우리 것과 나란히 쟀다.
"크레파스 같다"의 원인은 네 가지였고, 전부 우리 쪽 값·모델 문제였다.

| 증상 | 원인 | 고침 |
| --- | --- | --- |
| 흰 캔버스가 비친다 | 한 획의 피복률이 **72%** (레퍼런스는 거의 100%). 결을 끄고 유체를 꺼도 80% 가 한계였으므로 dab 하나의 농도 문제 | `DAB_MAX_ALPHA` 0.52 → 0.88 |
| 뜨개질 무늬 | dab 마다 가파른 테두리를 줬더니 그 테두리가 줄줄이 겹쳤다 | dab 단면을 부드럽게. 테두리는 쌓인 실루엣에서 나오게 |
| 잔물결 | dab 간격이 성겨 합이 계단처럼 쌓였다 | `dabsPerRadius` 2.8 → 6.2 |
| 테두리 그림자가 없다 | 광택을 올리면서 확산광이 0.18 까지 내려갔다 | 확산광을 양 끝에서 충분히 남기도록 광택 범위를 다시 잡음 |
| 섞인 자리가 고르게 한 색 | 붓이 색을 **하나만** 물었다 | 붓 폭을 따라 8칸 |

### 쌓임 보정을 거듭제곱으로

간격을 촘촘히 두면 같은 자리를 더 여러 번 덮으므로 한 번의 양을 줄여야 한다.
예전에는 비례로 나눴는데(`alpha × ref/dabs`), 남는 비율은 (1-a) 의 **곱**으로
쌓이므로 보정도 거듭제곱이어야 한다.

```
alpha = 1 - (1 - alpha) ^ (ref / dabs)
```

비례로 나누면 간격을 촘촘히 할수록 오히려 더 연해진다. 실제로 그랬다 —
`dabsPerRadius` 를 2.8 에서 5.5 로 올렸더니 피복률이 78% 에서 71% 로 떨어졌다.

### 붓 폭을 따라 여러 색을 문다

`smudge_bucket` 을 획 사이가 아니라 **한 붓 안에서 폭 방향**으로 쓴다.
8칸이면 충분하다 — 붓털 다발 수 정도다.

- `smudge.frag` 가 1×1 이 아니라 8×1 에 그린다. 칸마다 붓 폭의 다른 지점을 훑는다
- `dab.vert` 가 붓 폭 방향 좌표 `v_broad` 를 넘긴다 (`a_corner.y`, 회전 뒤 진행 방향과 수직)
- `dab.frag` 가 그 좌표로 집어 온 색을 읽는다

이걸 넣기 전에는 파랑으로 빨강을 지나가면 고르게 한 가지 보라가 됐다.
넣은 뒤에는 빨강이 줄무늬로 살아남은 채 섞인다 — 레퍼런스와 같은 모양이다.
