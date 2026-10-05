# 이 폴더는 우리가 쓴 코드가 아니다

David Li 의 **Fluid Paint** (https://david.js.org 아님 — https://david.li/paint) 를
그대로 가져온 것이다.

- 원본: https://github.com/dli/paint
- 라이선스: MIT (`LICENSE` 참고). 저작권 표기를 지우지 말 것
- 가져온 날: 2026-09-29, `master` 최신

## 돌리는 법

빌드 단계가 없다. 순수 JS + GLSL이고 셰이더를 실행 중에 불러온다.
`public/` 아래 있으므로 Vite 개발 서버가 그대로 내보낸다.

```
pnpm dev        →  http://localhost:5173/              (여기로 리다이렉트된다)
                   http://localhost:5173/?studio       (직접 만든 엔진)
```

디렉터리 경로 `/fluid-paint/` 는 Vite의 SPA 폴백에 걸리므로
`/fluid-paint/index.html` 까지 적어야 한다.

## 구조

```
paint.js        전체 조율, 입력, UI
brush.js        붓털 시뮬레이션 (마디 10개 × 붓털 N가닥, PBD)
simulator.js    물감 유체 (이류·발산·자코비·투영) 와 스플랫
wrappedgl.js    WebGL1 래퍼
shaders/        위 전부의 GLSL
```

WebGL**1** 이다. 우리 쪽 엔진(`src/paint`)은 WebGL2를 쓴다.

## 우리가 고친 것

원본 파일을 직접 손댔다. 우리 손이 닿은 자리에는 `[atelier]` 주석을 달아 뒀다.

| 파일 | 무엇을 |
| --- | --- |
| `shaders/setbristles.frag` | 붓털 심는 방식(`u_layout`)과 납작한 정도(`u_aspect`) 추가. 원본은 둥근붓 하나뿐이었다 |
| `brush.js` | 붓털 길이·흐트러짐·강성을 상수에서 인스턴스 값으로 열었다. 기본값은 원본과 같다 |
| `paint.js` | 붓 프리셋 목록, 프리셋 적용, 붓 높이를 붓털 길이에 비례시키기, 패널 접기 |
| `brushlibrary.js` | **새 파일.** 브러시 라이브러리 UI |
| `index.html`, `paint.css` | 라이브러리와 패널 손잡이. 한국어 라벨과 한 줄 설명, 물감 팔레트, 붓 커서 |
| `colorpicker.js`, `shaders/picker.frag` | 색상환 고리 → 큰 사각형 + 세로 띠 두 개. 패널 밖으로 삐져나가지 않게 자르는 `clip` |
| `shaders/smudge.frag` | **새 파일.** 붓이 물고 있는 색을 1×1 텍스처에 갱신한다 |
| `shaders/dab.frag` | 물감 색을 집어 온 색과 섞는다 (`u_smudge`) |
| `simulator.js` | `smudgeTexture` 핑퐁 두 장, `updateSmudge`, `clearSmudge`, 두께 전용 패스 |

### 붓 높이 주의

붓털 길이(`bristleLength`)를 바꾸면 붓이 캔버스 위에 뜬 높이도 같이 가야 한다.
길이만 늘리면 붓털이 캔버스에 파묻혀 마구 긁힌다.
`Paint.prototype.brushHeight()` 가 그 비율을 지킨다.


## 패널 크기는 상수가 아니라 DOM 에서 잰다

원본은 `PANEL_HEIGHT` 와 `COLOR_PICKER_TOP` 이 상수였다. 패널 배경과 색상환은
WebGL 로 캔버스에 그리는데 그 안의 옵션들은 DOM 이라, 옵션을 하나 넣을 때마다
두 숫자를 손으로 맞춰야 했다. 한 번 빠뜨리면 색상환이 패널 밖으로 나간다.

지금은 `measurePanel()` 이 `#ui` 의 `scrollHeight` 와 `#color-wheel-space` 의
`offsetTop` 에서 매 프레임 받아 온다. 값이 그대로면 아무 일도 하지 않는다.

- `getBoundingClientRect` 는 쓰지 않는다. transform 이 반영된 **화면상** 위치라
  패널이 접혀 있거나 여닫는 중이면 엉뚱한 값이 나온다
- `scroll` 이벤트에 걸지 않는다. 탭이 가려져 있으면 이벤트가 오지 않아 어긋난 채로 남는다

`#ui` 는 `pointer-events: none` 이어야 한다. `auto` 로 두면 이 div 가 클릭을
가로채서 **밑의 캔버스에 그린 색상환을 집을 수 없다.** 그래서 패널을 휠로
굴리는 것은 `onWheel` 이 좌표를 보고 대신 처리한다.


## 색 고르개 모양

원본은 색상환 고리 안에 채도·명도 정사각형을 내접시킨 모양이었다. 고리 지름
180 에 사각형 한 변이 106 밖에 안 돼서 실제로 집을 수 있는 면적이 좁았다.

큰 사각형 하나와 세로 띠 두 개(색상·물감 양)로 바꿨다. 같은 자리에서 사각형이
3배 넓어진다.

세로 방향 히트 박스는 위아래로 3 px 씩 넓혀 둔다. 정확히 경계 픽셀을 찍으면
반올림 때문에 빗나가서 띠의 맨 끝(색상 0, 물감 양 1)에 손이 닿지 않는다.
값은 어차피 clamp 하므로 넓혀도 안전하다.

사각형에서 **위로 갈수록 어두워진다.** 보통의 HSV 고르개와 반대지만 이 엔진은
RYB 안료 공간이라 v 가 안료의 양이다 — 많이 넣을수록 어둡다. 원본도 같았다.


## 팔레트 값을 구할 때

엔진은 붓 색을 `hsvToRyb` → RYB → `rybToRgb` 로 돌린다. "이 RGB 를 칠하고 싶다"를
바로 넣을 수 없어서 역으로 풀어야 하는데, **변환식을 따로 옮겨 적고 풀면 안 된다.**
한 번 그렇게 했다가 색상환 방향이 뒤집혀 노랑 자리에 보라가 나왔다.

브라우저에서 엔진의 `cssForHsv` 를 직접 부르며 CIE Lab ΔE 를 최소화한다.

파랑과 검정은 ΔE 7~10 으로 목표에서 멀다. RYB 모델의 가장 어두운 꼭짓점이
(0.2, 0.094, 0) 갈색이라 중성 검정이나 깊은 파랑에 닿지 못한다. 색상환에서 직접
골라도 마찬가지다 — 모델의 한계다.


## 원본과 나란히 놓고 보기

유화 질감이 원본에서 얼마나 멀어졌는지는 눈으로는 잘 안 보인다. 실제로 원본을
띄워 두고 같은 획을 그어 수치로 비교하는 편이 빠르다.

```bash
mkdir -p public/_ref
git archive fluid-paint public/fluid-paint | tar -x -C public/_ref --strip-components=2
# http://localhost:5173/_ref/index.html
```

비교할 값은 물감 텍스처의 a 채널(두께)이다. 같은 띠를 가로지르는 한 줄을 읽어
평균 높이와 3 px 간격 기울기를 본다. 인접 픽셀 기울기는 잔 노이즈만 재므로
붓결이 살아 있는지는 3 px 쪽을 봐야 한다.

기준값 (brushScale 28, 같은 띠):

| | 평균 높이 | 표준편차 | slope(3px) |
| --- | ---: | ---: | ---: |
| 원본 (붓털 100 가닥) | 10.74 | 0.58 | 0.471 |
| 지금 (고정 붓) | 12.80 | 1.35 | 0.794 |

다 보고 나면 `public/_ref` 는 지운다.
