# 초기 유화 브러시 8종 제작 사양표

이 표의 숫자는 `OilPaintDefaultPresetFactory.cs`의 시작값과 일치한다. 최종값이 아니라 동일한 기준에서 실기기 튜닝을 시작하기 위한 baseline이다.

## 1. 수치 사양

| Preset | Radius | Aspect | Hard | Bristle | Dabs/R | Flow | Thick | Wet | Pickup | Drag | Rough |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rich Oil | 32 | 1.15 | .72 | .38 | 2.8 | .58 | .82 | .90 | .30 | .24 | .27 |
| Dry Oil | 30 | 1.35 | .62 | .90 | 2.2 | .24 | .38 | .18 | .07 | .12 | .72 |
| Flat Hog | 25 | 2.80 | .84 | .76 | 3.2 | .50 | .67 | .75 | .22 | .27 | .42 |
| Filbert Oil | 22 | 1.75 | .68 | .46 | 3.0 | .48 | .62 | .80 | .25 | .24 | .34 |
| Detail Round | 7 | 1.00 | .90 | .20 | 3.8 | .62 | .30 | .70 | .08 | .08 | .30 |
| Broken Bristle | 34 | 1.55 | .58 | 1.00 | 1.9 | .31 | .44 | .34 | .12 | .18 | .67 |
| Oil Blender | 29 | 1.25 | .52 | .32 | 3.4 | .40 | 0 | .65 | .86 | .78 | .30 |
| Palette Knife | 30 | 3.50 | .98 | 0 | 4.0 | .70 | 1.55 | .76 | .16 | .38 | .20 |

## 2. 개별 제작 지시

### Rich Oil

- 목적: 제품의 대표 브러시. 단독으로 한 장을 그릴 수 있어야 한다.
- Tip: 둥근 filbert 외곽 + 중간 강모 5–12줄. 가장자리 일부는 부드럽게 끊는다.
- Grain: 기본은 약하거나 없음. 물감 자체의 body가 먼저 보여야 한다.
- Pressure: radius 0.15→1.0, flow 0.10→1.0, thickness 0.15→1.0.
- 합격: 한 획 안에서 얇은 시작, 두꺼운 중앙, 색 pickup, impasto highlight가 모두 보임.

### Dry Oil

- 목적: 캔버스 결을 드러내며 얇게 덧칠하는 scumble.
- Tip: 강모 사이 검은 틈이 크고 가장자리가 불규칙한 flat/filbert.
- Grain: CanvasLocked, fine canvas. 기본 strength .65.
- Placement: radius jitter .04, spacing jitter .16.
- Load: initial .85, depletion .78.
- 합격: 같은 위치를 다시 지나갈 때 캔버스의 같은 골이 반복해서 비어 있음.

### Flat Hog

- 목적: 배경과 큰 형태를 빠르게 만들고 붓 방향을 드러냄.
- Tip: 넓은 직사각 외곽, 끝의 강모가 약간 다른 길이.
- Rotation: StrokeDirection. 긴 축은 진행 방향에 수직으로 닿도록 현재 aspect 규칙 확인.
- 합격: S 곡선에서 붓 면이 자연스럽게 회전하고 모서리가 심하게 떨리지 않음.

### Filbert Oil

- 목적: 인물·천·구름처럼 부드러운 덩어리와 경계를 함께 처리.
- Tip: flat의 양 끝을 둥글린 타원, 중앙은 촘촘하고 양끝은 feather.
- 합격: flat보다 경계는 부드럽지만 round보다 방향성이 명확함.

### Detail Round

- 목적: 눈, 윤곽, 균열, 마지막 하이라이트.
- Tip: 중심 밀도가 높은 작은 원형, 약간 뾰족한 진행 방향 꼬리.
- Pressure curve: `(0,.08), (.35,.38), (1,1)`.
- 합격: 약한 압력에서도 선이 완전히 끊기지 않고, 강한 압력에서 갑자기 폭발하지 않음.

### Broken Bristle

- 목적: 손상 질감, 머리카락, 풀, 오래된 붓의 표현적 자국.
- Tip: 서로 분리된 6–20개 강모 섬. 단순 salt-and-pepper noise 금지.
- Placement: radius jitter .10, spacing jitter .25, rotation ±7°, across scatter 2.5 px, random flip X.
- Load: initial .8, depletion .7.
- 합격: 반복 패턴은 숨기되 스프레이처럼 방향을 잃지 않음.

### Oil Blender

- 목적: 새 색을 거의 공급하지 않고 젖은 경계를 섞음.
- Mode: Smudge.
- Tip: 부드러운 filbert 또는 mop. 외곽 feather가 넓다.
- 합격: 두 색 경계를 3회 이내로 통과했을 때 중간색과 streak가 생기며 투명 구멍이 커지지 않음.

### Palette Knife

- 목적: 날카로운 impasto 면, 긁듯 얹는 하이라이트.
- Tip: 매우 단단한 길쭉한 면, 끝 한쪽에 작은 결손.
- Rotation: PencilTilt; 지원하지 않는 입력에서는 fixed/stroke fallback 필요.
- 합격: 두께가 크지만 플라스틱 판처럼 균일하지 않고, 방향에 따라 면이 달라짐.

## 3. Tip/Grain 에셋 체크리스트

- [ ] 자체 제작 또는 상업 사용 라이선스 기록
- [ ] 원본 512–1024 px 보관
- [ ] grayscale, 색 정보 없음
- [ ] 중앙 정렬, 충분한 padding
- [ ] 외곽 hard crop 없음
- [ ] 25%, 50%, 100%, 200% 크기에서 반복/alias 확인
- [ ] Metal 실기기에서 filtering 확인
- [ ] grain seamless 경계 확인
- [ ] white fallback texture가 출시 preset에 남지 않음

## 4. 프리셋별 표준 QA

| Test | Rich | Dry | Flat | Filbert | Detail | Broken | Blender | Knife |
|---|---|---|---|---|---|---|---|---|
| 일정압 직선 | 필수 | 필수 | 필수 | 필수 | 필수 | 필수 | 필수 | 필수 |
| 약→강→약 | 필수 | 필수 | 필수 | 필수 | 최우선 | 필수 | 보조 | 필수 |
| 빠름→느림 | 필수 | 최우선 | 필수 | 필수 | 필수 | 최우선 | 필수 | 필수 |
| S 곡선 | 필수 | 필수 | 최우선 | 최우선 | 필수 | 필수 | 필수 | 최우선 |
| 두 색 경계 | 최우선 | 보조 | 필수 | 최우선 | 보조 | 보조 | 최우선 | 필수 |
| height 조명 | 최우선 | 필수 | 필수 | 필수 | 보조 | 필수 | 보조 | 최우선 |

## 5. 배포 전 승인 질문

각 브러시에 모두 “예”라고 답할 수 있어야 한다.

1. 이름을 가려도 다른 브러시와 구분되는가?
2. 썸네일이 실제 첫 획을 정직하게 예측하게 하는가?
3. 최소 한 가지 복원 task에서 이 브러시가 가장 좋은 선택인가?
4. 20분 사용해도 반복 무늬가 거슬리지 않는가?
5. 압력 없는 손가락 입력에서도 사용할 수 있는가?
6. Undo/replay 후 모양이 픽셀 수준으로 같은가?
7. 목표 iPad에서 5분 연속 사용 시 프레임 예산을 지키는가?
8. tip/grain의 라이선스와 원본 파일을 추적할 수 있는가?
