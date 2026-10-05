var Paint = (function () {
    'use strict';

    var InteractionMode = {
        NONE: 0,
        PAINTING: 1,
        RESIZING: 2,
        PANNING: 3
    };

    var ResizingSide = {
        NONE: 0,
        LEFT: 1,
        RIGHT: 2,
        BOTTOM: 3,
        TOP: 4,
        TOP_LEFT: 5,
        TOP_RIGHT: 6,
        BOTTOM_LEFT: 7,
        BOTTOM_RIGHT: 8
    };

    var ColorModel = {
        RYB: 0,
        RGB: 1
    };


    var QUALITIES = [
        {
            name: '낮음',
            resolutionScale: 1.0
        },
        {
            name: '보통',
            resolutionScale: 1.5
        },
        {
            name: '높음',
            resolutionScale: 2.0
        }
    ];

    var INITIAL_QUALITY = 1;

    // [atelier] 붓 목록.
    //
    // 이 엔진에서 붓 하나를 정하는 값은 이게 전부다.
    //   layout     0 둥근붓 · 1 납작붓 · 2 부채붓 (붓털을 어떻게 심는가)
    //   aspect     획 폭 쪽으로 눌린 정도. 작을수록 납작하다
    //   bristles   붓털 수 (10~100)
    //   scale      붓 반지름 (5~75)
    //   length     붓털 길이. 길수록 잘 휘어 끌리는 맛이 난다
    //   jitter     심는 자리의 흐트러짐. 크면 성기고 거칠다
    //   stiffness  붓털마다 강성이 얼마나 다른지
    //   alpha      한 번 지날 때 놓는 물감량
    //   fluidity   물감이 얼마나 흐르는가 (0.6~0.9)
    // [atelier] 유화 물감 팔레트.
    //
    // 색상환만으로는 원하는 색을 짚기 어렵다. 유화는 원래 정해진 안료를 짜서
    // 쓰므로 고전 안료를 그대로 칸으로 둔다.
    //
    // 값이 HSV 인 이유: 엔진은 붓 색을 hsvToRyb → (RYB 공간) → rybToRgb 로
    // 돌린다. 그래서 "이 RGB 를 칠하고 싶다"를 바로 넣을 수 없고, 역으로 풀어야
    // 한다. 아래 값은 CIE Lab ΔE 를 최소화하는 HSV 를 수치로 풀어 넣은 것이다.
    //
    // 푸는 것은 반드시 **엔진의 cssForHsv 를 직접 불러서** 해야 한다. 변환식을
    // 따로 옮겨 적고 풀었다가 색상환 방향이 뒤집혀 노랑 자리에 보라가 나왔다.
    //
    // 파랑과 검정은 ΔE 7~10 으로 목표에서 멀다. RYB 모델의 가장 어두운 꼭짓점이
    // (0.2, 0.094, 0) 갈색이라 중성 검정이나 깊은 파랑에 닿지 못한다. 색상환에서
    // 골라도 마찬가지다 — 모델의 한계지 팔레트의 한계가 아니다.
    // 더 깊은 색이 필요하면 '색 섞는 방식'을 디지털로 바꾼다.
    //
    // 칸 색은 엔진과 **같은 변환**으로 칠한다. 보이는 대로 칠해진다.
    var PALETTE = [
        { name: '티타늄 화이트',   hsv: [0.518, 0.651, 0.042] },
        { name: '네이플스 옐로',   hsv: [0.732, 0.973, 0.324] },
        { name: '카드뮴 옐로',     hsv: [0.740, 0.988, 0.836] },
        { name: '옐로 오커',       hsv: [0.752, 0.573, 0.605] },
        { name: '카드뮴 오렌지',   hsv: [0.859, 0.896, 0.745] },
        { name: '카드뮴 레드',     hsv: [0.000, 0.775, 0.913] },
        { name: '알리자린 크림슨', hsv: [0.060, 0.635, 0.993] },
        { name: '번트 시에나',     hsv: [0.952, 0.252, 0.805] },
        { name: '로 엄버',         hsv: [0.355, 0.124, 0.765] },
        { name: '번트 엄버',       hsv: [0.266, 0.165, 0.882] },
        { name: '샙 그린',         hsv: [0.507, 0.460, 0.766] },
        { name: '비리디언',        hsv: [0.408, 0.846, 0.993] },
        { name: '세룰리안 블루',   hsv: [0.342, 1.000, 0.830] },
        { name: '울트라마린',      hsv: [0.276, 0.996, 0.999] },
        { name: '프러시안 블루',   hsv: [0.326, 0.618, 1.000] },
        { name: '아이보리 블랙',   hsv: [0.309, 0.253, 1.000] }
    ];

    var RECENT_COLOR_SLOTS = 8;

    var BRUSH_PRESETS = [
        {
            name: '유화',
            presets: [
                // 수치는 docs/research/BRUSH_PRESET_SPEC_TABLE_KO.md 의 8종 사양을 옮긴 것이다.
                // radius 만 우리 캔버스에 맞춰 줄였다.
                { name: 'Rich Oil', label: '진한 유화', thick: 0.82, drag: 0.24, smudge: 0.55, smudgeLength: 0.90, smudgeRadius: 1.00, scatter: 0.08, angleJitter: 0.10, radiusJitter: 0.08, grain: 0.10, grainFade: 0.22,  radius: 13, aspect: 1.15, angle: -35, angleFollow: 0.70, dabsPerRadius: 6.2,
                  hardness: 0.72, squareness: 0.25, bristles: 9,  bristleDepth: 0.12, ragged: 0.27, alpha: 0.82, fluidity: 0.870, seed: 11 },
                { name: 'Dry Oil', label: '마른 붓', thick: 0.38, drag: 0.12, smudge: 0.13, smudgeLength: 0.80, smudgeRadius: 0.80, scatter: 0.16, angleJitter: 0.16, radiusJitter: 0.12, grain: 0.72, grainFade: 0.85,   radius: 12, aspect: 1.35, angle: -35, angleFollow: 0.50, dabsPerRadius: 4.8,
                  hardness: 0.62, squareness: 0.30, bristles: 20, bristleDepth: 0.90, ragged: 0.72, alpha: 0.40, fluidity: 0.654, seed: 22 },
                { name: 'Flat Hog', label: '평붓', thick: 0.67, drag: 0.27, smudge: 0.40, smudgeLength: 0.91, smudgeRadius: 1.10, scatter: 0.07, angleJitter: 0.08, radiusJitter: 0.08, grain: 0.20, grainFade: 0.30,  radius: 10, aspect: 2.80, angle: 0,   angleFollow: 1.00, dabsPerRadius: 7.0,
                  hardness: 0.84, squareness: 0.70, bristles: 16, bristleDepth: 0.34, ragged: 0.42, alpha: 0.74, fluidity: 0.825, seed: 33 },
                { name: 'Filbert', label: '필버트', thick: 0.62, drag: 0.24, smudge: 0.45, smudgeLength: 0.90, smudgeRadius: 1.00, scatter: 0.09, angleJitter: 0.12, radiusJitter: 0.10, grain: 0.14, grainFade: 0.26,   radius: 9,  aspect: 1.75, angle: -35, angleFollow: 0.90, dabsPerRadius: 6.6,
                  hardness: 0.68, squareness: 0.10, bristles: 11, bristleDepth: 0.18, ragged: 0.34, alpha: 0.70, fluidity: 0.840, seed: 44 },
                { name: 'Detail', label: '세필', thick: 0.30, drag: 0.08, smudge: 0.15, smudgeLength: 0.84, smudgeRadius: 1.20, scatter: 0.04, angleJitter: 0.06, radiusJitter: 0.05, grain: 0.10, grainFade: 0.20,    radius: 3,  aspect: 1.00, angle: 0,   angleFollow: 1.00, dabsPerRadius: 8.4,
                  hardness: 0.90, squareness: 0.00, bristles: 4,  bristleDepth: 0.10, ragged: 0.30, alpha: 0.85, fluidity: 0.810, seed: 55 }
            ]
        },
        {
            name: '기법·도구',
            presets: [
                { name: 'Broken', label: '갈라진 붓', thick: 0.44, drag: 0.18, smudge: 0.22, smudgeLength: 0.85, smudgeRadius: 0.90, scatter: 0.25, angleJitter: 0.22, radiusJitter: 0.16, grain: 0.67, grainFade: 0.80,    radius: 14, aspect: 1.55, angle: -35, angleFollow: 0.60, dabsPerRadius: 4.2,
                  hardness: 0.58, squareness: 0.35, bristles: 24, bristleDepth: 1.00, ragged: 0.67, alpha: 0.48, fluidity: 0.702, seed: 66 },
                { name: 'Blender', label: '문지르개', thick: 0.10, drag: 0.78, smudge: 0.95, smudgeLength: 0.96, smudgeRadius: 1.80, scatter: 0.10, angleJitter: 0.14, radiusJitter: 0.10, grain: 0.10, grainFade: 0.30,   radius: 12, aspect: 1.25, angle: 0,   angleFollow: 1.00, dabsPerRadius: 7.5,
                  hardness: 0.52, squareness: 0.00, bristles: 8,  bristleDepth: 0.14, ragged: 0.30, alpha: 0.12, fluidity: 0.795, seed: 77 },
                { name: 'Knife', label: '나이프', thick: 1.55, drag: 0.38, smudge: 0.30, smudgeLength: 0.93, smudgeRadius: 0.70, scatter: 0.03, angleJitter: 0.04, radiusJitter: 0.04, grain: 0.08, grainFade: 0.14,     radius: 12, aspect: 3.50, angle: -45, angleFollow: 0.20, dabsPerRadius: 8.8,
                  hardness: 0.98, squareness: 0.95, bristles: 0,  bristleDepth: 0.00, ragged: 0.20, alpha: 0.92, fluidity: 0.828, seed: 88 }
            ]
        }
    ];

    // 붓털 슬라이더는 눈금을 제곱해서 쓴다. 프리셋에서 눈금을 되돌릴 때도 필요하다.
    var BRISTLE_SLIDER_POWER = 2.0;


    // [atelier] 마우스에는 압력이 없다. libmypaint 와 같은 값을 쓴다.
    var MOUSE_PRESSURE = 0.5;

    var INITIAL_PADDING = 100;
    var MIN_PAINTING_WIDTH = 300;
    var MAX_PAINTING_WIDTH = 4096; //this is further constrained by the maximum texture size

    //brush parameters
    var MAX_BRISTLE_COUNT = 100;
    var MIN_BRISTLE_COUNT = 10;
    var MIN_BRUSH_SCALE = 2;
    var MAX_BRUSH_SCALE = 60;
    var BRUSH_HEIGHT = 2.0; //how high the brush is over the canvas - this is scaled with the brushScale
    // [atelier] 붓 높이는 붓털 길이에 비례해야 한다. 길이만 바꾸고 높이를 두면
    // 붓털이 캔버스에 파묻혀 마구 긁힌다. 원본의 비율(2.0 / 4.5)을 기준으로 쓴다.
    // 값이 작을수록 붓을 깊이 눌러 붓털이 넓게 벌어진다.
    // 원본은 2.0/4.5 = 0.444 인데, 유화 붓치고는 너무 퍼져서 조금 들었다.
    var BRUSH_HEIGHT_RATIO = 0.62;
    var Z_THRESHOLD = 0.13333; //this is scaled with the brushScale


    //splatting parameters
    // [atelier] 붓이 물감(유체)을 밀어내는 힘.
    // 크면 획을 그을 때마다 물감이 젤리처럼 딸려 흘러서 미끌거린다.
    // 원본은 0.14. 유화보다 물엿에 가까워서 많이 낮췄다.
    var SPLAT_VELOCITY_SCALE = 0.075;
    var SPLAT_RADIUS = 0.05;

    // [atelier] dab 한 번이 놓는 물감의 양.
    // 원본은 붓털 수로 상한을 정했지만 붓털이 없어졌으므로 dab 기준으로 다시 잡는다.
    // [atelier] dab 하나가 놓는 색 농도.
    //
    // 두께와 한 값으로 묶여 있을 때는 이 값을 올리면 임파스토가 같이 폭주해서
    // 0.30 에 묶여 있었고, 그 탓에 한 획을 그어도 색이 제 농도의 40% 밖에
    // 안 올라와 물감이 아니라 파스텔처럼 보였다. 두께를 따로 뗀 뒤 올렸다.
    //
    // 0.52 로도 한 번 그어 72% 밖에 안 덮었다. 나머지 28% 로 흰 캔버스가 비치는 게
    // 크레파스로 보이던 가장 큰 이유였다. 레퍼런스(실제 앱) 는 한 획에 완전히 덮는다.
    // 결이나 유체를 꺼도 80% 가 한계였으므로 원인은 dab 하나의 농도였다.
    var DAB_MIN_ALPHA = 0.004;
    var DAB_MAX_ALPHA = 0.88; // [atelier] 아래 주석
    // 이 간격에서 위 값이 맞도록 맞춰 뒀다. 간격이 달라지면 양을 나눠 보정한다.
    // [atelier] 한 프레임에 붓이 색을 집어 오는 횟수의 상한.
    // 1×1 패스라 싸지만 무한정 늘릴 이유도 없다.
    var SMUDGE_SAMPLES = 4;

    // [atelier] 사양표 Thick 열을 실제 두께로 옮기는 배율.
    // 원본(붓털 100 가닥)이 쌓던 높이를 기준으로 맞췄다 — 같은 띠에서 중앙값 9~10.
    var THICKNESS_SCALE = 4.3;

    // [atelier] 사양표 Drag 열을 유체를 미는 힘으로 옮기는 배율.
    // Rich Oil(.24)이 1 근처가 되도록 잡았다.
    var DRAG_SCALE = 4.2;

    // [atelier] 획의 단면 모양.
    //
    // 레퍼런스(실제 앱)의 유화 획을 확대해 보면 입체로 읽히는 것은 몸통의
    // 요철이 아니라 **가장자리의 낭떠러지**다. 몸통은 거의 평평하고, 테두리에
    // 어두운 선이 한 줄 생긴다. 그래서 고원 + 좁은 가장자리로 만든다.
    // 레퍼런스(실제 앱) 영상을 확대해 보면 몸통은 **매끈하다.** 입체로 읽히는
    // 것은 몸통의 요철이 아니라 획 전체의 가장자리에 지는 그림자다.
    //
    // dab 하나하나에 가파른 테두리를 주면 그 테두리가 줄줄이 겹쳐 뜨개질 무늬가
    // 된다. 그래서 dab 단면은 부드럽게 두고, 테두리는 쌓인 결과의 실루엣에서
    // 저절로 나오게 한다.
    var RELIEF = {
        edgeWidth: 1.0,    // 1 이면 부드러운 에르미트 곡선. 낮출수록 고원
        streak: 0.06       // 몸통 안 붓털 자국의 깊이
    };
    // 실험용으로 바깥에서 만질 수 있게 둔다

    var REFERENCE_DABS_PER_RADIUS = 6.2;


    //panel is aligned with the top left
    var PANEL_WIDTH = 300;
    // [atelier] 패널 높이는 DOM 에서 잰다.
    //
    // 원본은 상수였는데, 옵션을 하나 추가할 때마다 이 숫자와 색상환 위치를
    // 손으로 맞춰야 했다. 한 번 깜빡하면 색상환이 패널 밖으로 삐져나온다.
    // 아래는 아직 재기 전에 쓰는 대략값이다.
    var PANEL_HEIGHT_FALLBACK = 710;
    var PANEL_BLUR_SAMPLES = 13;
    var PANEL_BLUR_STRIDE = 8;

    var COLOR_PICKER_LEFT = 20;
    var PANEL_BOTTOM_PADDING = 24;

    var RESIZING_RADIUS = 20;
    var RESIZING_FEATHER_SIZE = 8; //in pixels 

    //box shadow parameters
    var BOX_SHADOW_SIGMA = 5.0;
    var BOX_SHADOW_WIDTH = 10.0;
    var PAINTING_SHADOW_ALPHA = 0.5;
    var PANEL_SHADOW_ALPHA = 1.0;

    //rendering parameters
    var BACKGROUND_GRAY = 0.7;
    var NORMAL_SCALE = 7.0;
    var F0 = 0.05;

    // [atelier] 마감. 원본은 젖은 유화 한쪽 끝에 고정돼 있었다.
    //
    // 거칠기 0.075 는 거울에 가깝고, 확산광이 0.15 라 형태가 거의 전부
    // 반사광에서 나온다. 그래서 물감이 번들거리고 기름져 보인다.
    // 한쪽 끝(1)이 원본 값이고, 0 쪽으로 갈수록 마른 물감처럼 가라앉는다.
    // [atelier] 광택 손잡이. 왼쪽이 마른 물감, 오른쪽이 갓 칠한 유화.
    //
    // 확산광 비중을 양 끝에서 모두 충분히 남긴다. 예전에는 광택을 올리면
    // 확산광이 0.15 까지 내려가 **가장자리 그림자가 사라졌다.** 유화가 입체로
    // 보이는 것은 반짝임보다 테두리에 지는 그늘 쪽이 크다.
    var GLOSS_ROUGHNESS = [0.45, 0.090];
    var GLOSS_SPECULAR = [0.10, 0.50];
    var GLOSS_DIFFUSE = [0.55, 0.30];
    var INITIAL_GLOSS = 0.45;
    var LIGHT_DIRECTION = [0, 1, 1];


    var HISTORY_SIZE = 4; //number of snapshots we store - this should be number of reversible actions + 1


    function pascalRow (n) {
        var line = [1];
        for (var k = 0; k < n; ++k) {
            line.push(line[k] * (n - k) / (k + 1));
        }
        return line;
    }

    //width should be an odd number
    function makeBlurShader (width) {
        var coefficients = pascalRow(width - 1 + 2);

        //take the 1s off the ends
        coefficients.shift();
        coefficients.pop();
        
        var normalizationFactor = 0;
        for (var i = 0; i < coefficients.length; ++i) {
            normalizationFactor += coefficients[i]; 
        }

        var shader = [
            'precision highp float;',

            'uniform sampler2D u_input;',

            'uniform vec2 u_step;',
            'uniform vec2 u_resolution;',

            'void main () {',
                'vec4 total = vec4(0.0);',

                'vec2 coordinates = gl_FragCoord.xy / u_resolution;',
                'vec2 delta = u_step / u_resolution;',
        ].join('\n');

        shader += '\n';

        for (var i = 0; i < width; ++i) {
            var offset = i - (width - 1) / 2;

            shader += 'total += texture2D(u_input, coordinates + delta * ' + offset.toFixed(1) + ') * ' + coefficients[i].toFixed(1) + '; \n';
        }

        shader += 'gl_FragColor = total / ' + normalizationFactor.toFixed(1) + ';\n }';

        return shader;
    }


    // [atelier] 썸네일에 쓸 CSS 색.
    //
    // 이 엔진은 색을 RYB로 저장하고 화면에 그릴 때 셰이더가 RGB로 바꾼다
    // (shaders/painting.frag 의 rybToRgb). 같은 변환을 여기서도 해야
    // 목록의 색과 실제로 칠해지는 색이 같아진다.
    function trilinear (p, v000, v100, v010, v001, v101, v011, v110, v111) {
        var out = [0, 0, 0];
        for (var i = 0; i < 3; ++i) {
            out[i] =
                v000[i] * (1 - p[0]) * (1 - p[1]) * (1 - p[2]) +
                v100[i] * p[0] * (1 - p[1]) * (1 - p[2]) +
                v010[i] * (1 - p[0]) * p[1] * (1 - p[2]) +
                v001[i] * (1 - p[0]) * (1 - p[1]) * p[2] +
                v101[i] * p[0] * (1 - p[1]) * p[2] +
                v011[i] * (1 - p[0]) * p[1] * p[2] +
                v110[i] * p[0] * p[1] * (1 - p[2]) +
                v111[i] * p[0] * p[1] * p[2];
        }
        return out;
    }

    function rybToRgb (ryb) {
        return trilinear(ryb,
            [1.0, 1.0, 1.0],
            [1.0, 0.0, 0.0],
            [0.163, 0.373, 0.6],
            [1.0, 1.0, 0.0],
            [1.0, 0.5, 0.0],
            [0.0, 0.66, 0.2],
            [0.5, 0.0, 0.5],
            [0.2, 0.094, 0.0]);
    }

    Paint.prototype.brushCss = function () {
        return this.cssForHsv(this.brushColorHSVA[0], this.brushColorHSVA[1], this.brushColorHSVA[2]);
    };

    /** 엔진이 쓰는 것과 **같은 변환**. 팔레트 칸이 실제 칠해질 색과 어긋나지 않는다. */
    Paint.prototype.cssForHsv = function (h, s, v) {
        var ryb = hsvToRyb(h, s, v);
        var rgb = this.colorModel === ColorModel.RGB
            ? [1 - ryb[1], 1 - ryb[0], 1 - ryb[2]]   // painting.frag 의 RGB 분기
            : rybToRgb(ryb);
        return 'rgb('
            + Math.round(Math.min(1, Math.max(0, rgb[0])) * 255) + ','
            + Math.round(Math.min(1, Math.max(0, rgb[1])) * 255) + ','
            + Math.round(Math.min(1, Math.max(0, rgb[2])) * 255) + ')';
    };

    function hsvToRyb (h, s, v) {
        h = h % 1;

        var c = v * s,
            hDash = h * 6;

        var x = c * (1 - Math.abs(hDash % 2 - 1));

        var mod = Math.floor(hDash);

        var r = [c, x, 0, 0, x, c][mod],
            g = [x, c, c, x, 0, 0][mod],
            b = [0, 0, x, c, c, x][mod];

        var m = v - c;

        r += m;
        g += m;
        b += m;

        return [r, g, b];
    }

    function makeOrthographicMatrix (matrix, left, right, bottom, top, near, far) {
        matrix[0] = 2 / (right - left);
        matrix[1] = 0;
        matrix[2] = 0;
        matrix[3] = 0;
        matrix[4] = 0;
        matrix[5] = 2 / (top - bottom);
        matrix[6] = 0;
        matrix[7] = 0;
        matrix[8] = 0;
        matrix[9] = 0;
        matrix[10] = -2 / (far - near);
        matrix[11] = 0;
        matrix[12] = -(right + left) / (right - left);
        matrix[13] = -(top + bottom) / (top - bottom);
        matrix[14] = -(far + near) / (far - near);
        matrix[15] = 1;

        return matrix;
    }

    function mix (a, b, t) {
        return (1.0 - t) * a + t * b;
    }

    //the texture is always updated to be (paintingWidth x paintingHeight) x resolutionScale
    function Snapshot (texture, paintingWidth, paintingHeight, resolutionScale) {
        this.texture = texture;
        this.paintingWidth = paintingWidth;
        this.paintingHeight = paintingHeight;
        this.resolutionScale = resolutionScale;
    }

    Snapshot.prototype.getTextureWidth = function () {
        return Math.ceil(this.paintingWidth * this.resolutionScale);
    };

    Snapshot.prototype.getTextureHeight = function () {
        return Math.ceil(this.paintingHeight * this.resolutionScale);
    };


    function Paint (canvas, wgl) {
        this.canvas = canvas;
        this.wgl = wgl;

        wgl.getExtension('OES_texture_float');
        wgl.getExtension('OES_texture_float_linear');

        WrappedGL.loadTextFiles([
            'shaders/splat.vert', 'shaders/splat.frag',
            'shaders/dab.vert', 'shaders/dab.frag',   // [atelier] 고정 붓
            'shaders/smudge.frag',                    // [atelier] 붓이 물고 있는 색
            'shaders/fullscreen.vert',
            'shaders/advect.frag',
            'shaders/divergence.frag',
            'shaders/jacobi.frag',
            'shaders/subtract.frag',
            'shaders/resize.frag',


            'shaders/painting.vert', 'shaders/painting.frag',
            'shaders/picker.vert', 'shaders/picker.frag',
            'shaders/panel.frag',
            'shaders/output.frag',
            'shaders/shadow.frag',
        ], start.bind(this));

        function start(shaderSources) {

            var maxTextureSize = wgl.getParameter(wgl.MAX_TEXTURE_SIZE);
            this.maxPaintingWidth = Math.min(MAX_PAINTING_WIDTH, maxTextureSize / QUALITIES[QUALITIES.length - 1].resolutionScale);


            this.framebuffer = wgl.createFramebuffer();


            this.paintingProgram = wgl.createProgram(
                shaderSources['shaders/painting.vert'], shaderSources['shaders/painting.frag']);

            this.paintingProgramRGB = wgl.createProgram(
                shaderSources['shaders/painting.vert'], '#define RGB \n ' + shaderSources['shaders/painting.frag']);

            this.resizingPaintingProgram = wgl.createProgram(
                shaderSources['shaders/painting.vert'], '#define RESIZING \n ' + shaderSources['shaders/painting.frag']);

            this.resizingPaintingProgramRGB = wgl.createProgram(
                shaderSources['shaders/painting.vert'], '#define RESIZING \n #define RGB \n ' + shaderSources['shaders/painting.frag']);

            this.savePaintingProgram = wgl.createProgram(
                shaderSources['shaders/painting.vert'], '#define SAVE \n ' + shaderSources['shaders/painting.frag']);

            this.savePaintingProgramRGB = wgl.createProgram(
                shaderSources['shaders/painting.vert'], '#define SAVE \n #define RGB \n ' + shaderSources['shaders/painting.frag']);

            this.panelProgram = wgl.createProgram(
                shaderSources['shaders/fullscreen.vert'], shaderSources['shaders/panel.frag'], { 'a_position': 0 });


            this.blurProgram = wgl.createProgram(
                shaderSources['shaders/fullscreen.vert'], makeBlurShader(PANEL_BLUR_SAMPLES), { 'a_position': 0 });

            this.outputProgram = wgl.createProgram(
                shaderSources['shaders/fullscreen.vert'], shaderSources['shaders/output.frag'], { 'a_position': 0 });

            this.shadowProgram = wgl.createProgram(
                shaderSources['shaders/fullscreen.vert'], shaderSources['shaders/shadow.frag'], { 'a_position': 0 });


            this.quadVertexBuffer = wgl.createBuffer();
            wgl.bufferData(this.quadVertexBuffer, wgl.ARRAY_BUFFER, new Float32Array([-1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]), wgl.STATIC_DRAW);


            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;



            //position of painting on screen, and its dimensions
            //units are pixels
            this.paintingRectangle = new Rectangle(
                INITIAL_PADDING, INITIAL_PADDING,
                Utilities.clamp(canvas.width - INITIAL_PADDING * 2, MIN_PAINTING_WIDTH, this.maxPaintingWidth),
                Utilities.clamp(canvas.height - INITIAL_PADDING * 2, MIN_PAINTING_WIDTH, this.maxPaintingWidth));

            //simulation resolution = painting resolution * resolution scale
            this.resolutionScale = QUALITIES[INITIAL_QUALITY].resolutionScale;


            this.simulator = new Simulator(wgl, shaderSources, this.getPaintingResolutionWidth(), this.getPaintingResolutionHeight());


            this.snapshots = [];
            for (var i = 0; i < HISTORY_SIZE; ++i) { //we always keep around HISTORY_SIZE snapshots to avoid reallocating textures
                var texture = wgl.buildTexture(wgl.RGBA, wgl.FLOAT, this.getPaintingResolutionWidth(), this.getPaintingResolutionHeight(), null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);

                wgl.framebufferTexture2D(this.framebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, texture, 0);
                wgl.clear(wgl.createClearState().bindFramebuffer(this.framebuffer), wgl.COLOR_BUFFER_BIT);

                this.snapshots.push(new Snapshot(texture, this.paintingRectangle.width, this.paintingRectangle.height, this.resolutionScale));
            }


            this.snapshotIndex = 0; //while not undoing, the next snapshot index we'd save into; when undoing, our current position in the snapshots - undo to snapshotIndex - 1, redo to snapshotIndex + 1

            this.undoing = false;
            this.maxRedoIndex = 0; //while undoing, the maximum snapshot index that can be applied



            this.brushInitialized = false; //whether the user has moved their mouse at least once and we thus have a valid brush position

            this.brushX = 0;
            this.brushY = 0;

            // [atelier] 기본 붓을 많이 줄였다. 원본 50 은 화면 절반을 덮는다.
            this.brushScale = 12;
            this.brushHeightScale = BRUSH_HEIGHT; // [atelier] 프리셋이 덮어쓴다

            // [atelier] 고정 붓 상태.
            // 붓털을 시뮬레이션하지 않으므로 붓 모양은 이 네 값과 tip 마스크가 전부다.
            this.dabAspect = 1.0;        // libmypaint elliptical_dab_ratio
            this.dabAngle = 0.0;         // libmypaint elliptical_dab_angle (라디안)
            this.angleFollow = 1.0;      // 1 이면 진행 방향을 따르고 0 이면 손목 각 고정
            this.dabsPerRadius = 2.8;    // 조사 문서 §3.1: 중형 유화 2.2~3.4
            this.tipTexture = null;
            this.tipKey = '';
            // 붓 끝의 생김새. 프리셋이 덮어쓴다.
            this.tip = { hardness: 0.55, squareness: 0.2, bristles: 12, bristleDepth: 0.35, ragged: 0.18, seed: 1 };

            // dab 마다 주는 흔들림. 없으면 같은 자국이 줄을 맞춰 격자가 된다.
            // (libmypaint 의 offset_by_random / radius_by_random 과 같은 자리)
            this.scatter = 0.10;       // 붓 반지름 대비 위치 흔들림
            this.angleJitter = 0.12;   // 라디안
            this.radiusJitter = 0.10;

            // 캔버스 결. tip 과 다른 층이다.
            this.grainTexture = null;
            this.grainScale = 1 / 180;
            this.grainStrength = 0.35;
            // 이 두께를 넘으면 결이 묻힌다. 낮출수록 잘 덮는 물감이 된다.
            this.grainFadeAt = 0.55;

            // [atelier] smudge — 붓이 캔버스 색을 집어 온다.
            //
            // 붓털마다 물감을 들고 있던 구조를 버렸으므로 그 자리를 이것이 메운다.
            // 없으면 파랑 위에 노랑을 그어도 그냥 덮인다. (설계 문서 §2.4)
            // 이름은 libmypaint 를 따른다 — 나중에 대조하기 쉽다.
            //
            // smudgeLength 는 **dab 하나당** 감쇠다. 반지름당 dab 이 2.8 개이므로
            // 0.5 같은 값은 반 붓너비도 못 가서 색을 잊는다. 붓너비 w 만큼
            // 끌고 가려면 L = 0.5^(1/(2·dabsPerRadius·w)) 쯤 — 0.9 언저리다.
            // 두께와 끌림. 사양표의 Thick·Drag 열이다.
            // 두께는 색 농도와 별개다 — 자세한 이유는 shaders/dab.frag 참고.
            this.thickness = 0.82;
            this.paintDrag = 0.24;
            this.relief = { edgeWidth: RELIEF.edgeWidth, streak: RELIEF.streak };

            this.smudge = 0.55;        // smudge: 집어 온 색으로 칠하는 비율
            this.smudgeLength = 0.90;  // smudge_length: 캔버스 색으로 바뀌는 속도. 0 이면 즉시
            this.smudgeRadius = 1.0;   // smudge_radius_log: 붓 반지름 대비 집어 오는 원

            this.strokeSeed = 0;
            this.strokeVariant = 0;
            this.strokePhase = 0;
            this.dabIndex = 0;

            // [atelier] 펜 입력. 마우스에는 압력이 없으므로 고정값을 쓴다.
            // libmypaint 도 버튼을 누른 마우스를 0.5 로 본다.
            this.penPressure = MOUSE_PRESSURE;
            this.penTilt = 0;        // 0 이면 수직, π/2 면 완전히 눕힘
            this.penAzimuth = 0;
            this.lastPressure = MOUSE_PRESSURE;
            this.hasPenInput = false;

            // 손떨림 안정화
            this.penFilter = new OneEuro.Pen();
            this.penFilter.setStrength(0.45);

            // 압력이 무엇을 바꾸는지 (조사 문서 §2.5)
            this.pressureSize = 0.25;   // 압력 0 일 때 남는 지름 비율
            this.pressureFlow = 0.25;   // 압력 0 일 때 남는 물감 비율
            this.tiltAspect = 1.2;      // 눕힐수록 넓은 면이 닿는다

            // 거리 기반 리샘플링 상태
            this.dabQueue = [];
            this.lastDabX = 0;
            this.lastDabY = 0;
            this.dabCarry = 0;
            this.strokeDistance = 0;
            this.strokeAngle = 0;

            // [atelier] 도구 패널을 접을 수 있게 한다. 패널이 캔버스를 가리기 때문이다.
            // 접으면 WebGL로 그리는 흐린 배경과 색상환도 같이 멈춰야 한다.
            this.panelOpen = true;

            // [atelier] 원본은 켤 때마다 무작위 색이었다(Math.random()).
            // 무슨 색인지 이름을 댈 수 없으면 팔레트를 둔 뜻이 없다.
            // 번트 시에나 — 밑칠에 쓰는 고전 안료다.
            this.brushColorHSVA = [0.952, 0.252, 0.805, 0.8];


            this.colorModel = ColorModel.RYB;

            this.needsRedraw = true; //whether we need to redraw the painting





            this.fluiditySlider = new Slider(document.getElementById('fluidity-slider'), this.simulator.fluidity, 0.6, 0.9, (function (fluidity) {
              this.simulator.fluidity = fluidity;
            }).bind(this));

            // [atelier] 붓털 수 슬라이더를 납작한 정도로 바꿨다.
            // 붓털이 없어졌고, 고정 붓에서 모양을 가장 크게 바꾸는 값이 이것이다.
            this.flatnessSlider = new Slider(document.getElementById('bristles-slider'), 0, 0, 1, (function (t) {
                this.dabAspect = 1.0 + t * 5.0;   // libmypaint elliptical_dab_ratio 1~6
            }).bind(this));

            this.brushSizeSlider = new Slider(document.getElementById('size-slider'), this.brushScale, MIN_BRUSH_SCALE, MAX_BRUSH_SCALE, (function(size) {
                this.brushScale = size;
            }).bind(this));

            // [atelier] 손떨림 안정화. 1€ 필터 세기를 한 손잡이로 조절한다.
            this.stabilizerSlider = new Slider(document.getElementById('stabilizer-slider'), 0.45, 0, 1, (function (t) {
                this.penFilter.setStrength(t);
            }).bind(this));

            // [atelier] 마감 (마른 물감 ↔ 젖은 유화)
            this.setGloss(INITIAL_GLOSS);
            // [atelier] 붓이 캔버스 색을 얼마나 집어 오는지. 0 이면 팔레트 색 그대로다.
            this.smudgeSlider = new Slider(document.getElementById('smudge-slider'), this.smudge, 0, 1, (function (t) {
                this.smudge = t;
            }).bind(this));

            this.glossSlider = new Slider(document.getElementById('gloss-slider'), INITIAL_GLOSS, 0, 1, (function (t) {
                this.setGloss(t);
            }).bind(this));


            
            this.qualityButtons = new Buttons(document.getElementById('qualities'),
                QUALITIES.map(function (q) { return q.name })
            , INITIAL_QUALITY, (function (index) {
                this.saveSnapshot();

                this.resolutionScale = QUALITIES[index].resolutionScale;
                this.simulator.changeResolution(this.getPaintingResolutionWidth(), this.getPaintingResolutionHeight());

                this.needsRedraw = true;
            }).bind(this)); 

            this.modelButtons = new Buttons(document.getElementById('models'),
              ['물감', '디지털'], 0, (function (index) {
                  if (index === 0) {
                      this.colorModel = ColorModel.RYB;
                  } else if (index === 1) {
                      this.colorModel = ColorModel.RGB;
                  }

                  this.needsRedraw = true;
              }).bind(this));


            // [atelier] 브러시 라이브러리. 오른쪽에 뜬다.
            this.brushLibrary = new BrushLibrary(
                document.getElementById('brush-library'), BRUSH_PRESETS,
                this.applyBrushPreset.bind(this));
            this.libraryColor = this.brushCss();
            this.brushLibrary.setColor(this.libraryColor);
            this.brushLibrary.select(BRUSH_PRESETS[0].presets[0]);

            this.colorPicker = new ColorPicker(this, 'brushColorHSVA', wgl, canvas, shaderSources, COLOR_PICKER_LEFT, 0);

            this.recentColors = [];
            this.panelHeight = PANEL_HEIGHT_FALLBACK;

            this.buildPalette();
            this.setUpBrushCursor();
            this.measurePanel();

            //this.brushViewer = new BrushViewer(wgl, this.brushProgram, 0, 800, 200, 300);


            // [atelier] 패널 여닫기 손잡이
            this.libraryOpen = true;
            document.getElementById('tools-toggle').addEventListener('click', (function () {
                this.setPanelOpen(!this.panelOpen);
            }).bind(this));
            document.getElementById('library-toggle').addEventListener('click', (function () {
                this.setLibraryOpen(!this.libraryOpen);
            }).bind(this));
            // Tab 으로 둘 다 한 번에 치운다. 그림만 보고 싶을 때가 있다.
            document.addEventListener('keydown', (function (event) {
                if (event.key !== 'Tab') return;
                event.preventDefault();
                var hide = this.panelOpen || this.libraryOpen;
                this.setPanelOpen(!hide);
                this.setLibraryOpen(!hide);
            }).bind(this));

            this.saveButton = document.getElementById('save-button');
            this.saveButton.addEventListener('click', this.save.bind(this));
            this.saveButton.addEventListener('touchstart', (function (event) {
                event.preventDefault();
                this.save();
            }).bind(this));


            this.clearButton = document.getElementById('clear-button');  
            this.clearButton.addEventListener('click', this.clear.bind(this));
            this.clearButton.addEventListener('touchstart', (function (event) {
                event.preventDefault();

                this.clear();
            }).bind(this));


            this.undoButton = document.getElementById('undo-button');
            this.undoButton.addEventListener('click', this.undo.bind(this));
            this.undoButton.addEventListener('touchstart', (function (event) {
                event.preventDefault();
                this.undo();
            }).bind(this));

            this.redoButton = document.getElementById('redo-button');
            this.redoButton.addEventListener('click', this.redo.bind(this));
            this.redoButton.addEventListener('touchstart', (function (event) {
                event.preventDefault();
                this.redo();
            }).bind(this));

            this.refreshDoButtons();



            this.mainProjectionMatrix = makeOrthographicMatrix(new Float32Array(16), 0.0, this.canvas.width, 0, this.canvas.height, -5000.0, 5000.0);


            this.onResize = function () {
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;

                this.paintingRectangle.left = Utilities.clamp(this.paintingRectangle.left, -this.paintingRectangle.width, this.canvas.width);
                this.paintingRectangle.bottom = Utilities.clamp(this.paintingRectangle.bottom, -this.paintingRectangle.height, this.canvas.height);


                this.measurePanel();


                //this.brushViewer.bottom = this.canvas.height - 800;


                this.mainProjectionMatrix = makeOrthographicMatrix(new Float32Array(16), 0.0, this.canvas.width, 0, this.canvas.height, -5000.0, 5000.0);

                this.canvasTexture = wgl.buildTexture(wgl.RGBA, wgl.UNSIGNED_BYTE, this.canvas.width, this.canvas.height, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
                this.tempCanvasTexture = wgl.buildTexture(wgl.RGBA, wgl.UNSIGNED_BYTE, this.canvas.width, this.canvas.height, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
                this.blurredCanvasTexture = wgl.buildTexture(wgl.RGBA, wgl.UNSIGNED_BYTE, this.canvas.width, this.canvas.height, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);


                this.needsRedraw = true;
            };
            this.onResize();

            window.addEventListener('resize', this.onResize.bind(this));
            

            this.mouseX = 0;
            this.mouseY = 0;

            this.spaceDown = false;


            canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
            canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
            document.addEventListener('mouseup', this.onMouseUp.bind(this));
            canvas.addEventListener('mouseover', this.onMouseOver.bind(this));

            // [atelier] 압력과 기울기는 포인터 이벤트에만 있다.
            // dab 도 여기서 만든다 — 합쳐진 표본(coalesced)을 써야 빠른 획이 안 끊긴다.
            canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
            canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
            document.addEventListener('pointerup', this.onPointerUp.bind(this));

            document.addEventListener('wheel', this.onWheel.bind(this));


            document.addEventListener('keydown', (function (event) {
                if (event.keyCode === 32) { //space
                    this.spaceDown = true;
                } else if (event.keyCode === 90) { //z
                    this.undo();
                } else if (event.keyCode === 82) { //r
                    this.redo();
                }
            }).bind(this));

            document.addEventListener('keyup', (function (event) {
                if (event.keyCode === 32) {
                    this.spaceDown = false;
                }
            }).bind(this));


            canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
            canvas.addEventListener('touchmove', this.onTouchMove.bind(this));
            canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
            canvas.addEventListener('touchcancel', this.onTouchCancel.bind(this));


            //these are used while we're resizing
            this.resizingSide = ResizingSide.NONE; //which side we're currently resizing

            //this is updated during resizing according to the new mouse position
            //when we finish resizing, we then resize the simulator to match
            this.newPaintingRectangle = null;

            
            this.interactionState = InteractionMode.NONE;


            var update = (function () {
                this.update();
                requestAnimationFrame(update);
            }).bind(this);
            update();
        }
    }

    Paint.prototype.getPaintingResolutionWidth = function () {
        return Math.ceil(this.paintingRectangle.width * this.resolutionScale);
    };


    Paint.prototype.getPaintingResolutionHeight = function () {
        return Math.ceil(this.paintingRectangle.height * this.resolutionScale);
    };

    Paint.prototype.drawShadow = function (alpha, rectangle) {
        var wgl = this.wgl;

        var shadowDrawState = wgl.createDrawState()
          .uniform2f('u_bottomLeft', rectangle.left, rectangle.bottom)
          .uniform2f('u_topRight', rectangle.getRight(), rectangle.getTop())
          .uniform1f('u_sigma', BOX_SHADOW_SIGMA) 
          .uniform1f('u_alpha', alpha) 
          .enable(wgl.BLEND)
          .blendFunc(wgl.ONE, wgl.ONE_MINUS_SRC_ALPHA)
          .useProgram(this.shadowProgram)
          .vertexAttribPointer(this.quadVertexBuffer, 0, 2, wgl.FLOAT, wgl.FALSE, 0, 0);

        var rectangles = [
            new Rectangle(rectangle.left - BOX_SHADOW_WIDTH, rectangle.bottom - BOX_SHADOW_WIDTH, rectangle.width + 2 * BOX_SHADOW_WIDTH, BOX_SHADOW_WIDTH), //bottom
            new Rectangle(rectangle.left - BOX_SHADOW_WIDTH, rectangle.getTop(), rectangle.width + 2 * BOX_SHADOW_WIDTH, BOX_SHADOW_WIDTH), //top
            new Rectangle(rectangle.left - BOX_SHADOW_WIDTH, rectangle.bottom, BOX_SHADOW_WIDTH, rectangle.height), //left
            new Rectangle(rectangle.getRight(), rectangle.bottom, BOX_SHADOW_WIDTH, rectangle.height) // right
        ];

        var screenRectangle = new Rectangle(0, 0, this.canvas.width, this.canvas.height);
        for (var i = 0; i < rectangles.length; ++i) {
            var rect = rectangles[i];
            rect.intersectRectangle(screenRectangle);

            if (rect.getArea() > 0) {
                shadowDrawState.viewport(rect.left, rect.bottom, rect.width, rect.height);
                wgl.drawArrays(shadowDrawState, wgl.TRIANGLE_STRIP, 0, 4);
            }
        }

    };

    function cursorForResizingSide (side) {
        if (side === ResizingSide.LEFT || side === ResizingSide.RIGHT) {
            return 'ew-resize';
        } else if (side === ResizingSide.BOTTOM || side === ResizingSide.TOP) {
            return 'ns-resize';
        } else if (side === ResizingSide.TOP_LEFT) {
            return 'nw-resize';
        } else if (side === ResizingSide.TOP_RIGHT) {
            return 'ne-resize';
        } else if (side === ResizingSide.BOTTOM_LEFT) {
            return 'sw-resize';
        } else if (side === ResizingSide.BOTTOM_RIGHT) {
            return 'se-resize';
        }
    }


    // [atelier] 목록에서 고른 붓을 실제로 든다.
    // [atelier] 마감을 한 축으로 조절한다.
    // 거칠기·반사광·확산광은 따로 놀면 안 되는 값이라 하나로 묶었다.
    Paint.prototype.setGloss = function (t) {
        this.gloss = t;
        this.roughness = mix(GLOSS_ROUGHNESS[0], GLOSS_ROUGHNESS[1], t);
        this.specularScale = mix(GLOSS_SPECULAR[0], GLOSS_SPECULAR[1], t);
        this.diffuseScale = mix(GLOSS_DIFFUSE[0], GLOSS_DIFFUSE[1], t);
        this.needsRedraw = true;
    };

    // [atelier] 도구 패널 접기/펴기.
    Paint.prototype.setPanelOpen = function (open) {
        this.panelOpen = open;
        document.getElementById('ui').classList.toggle('collapsed', !open);
        document.getElementById('tools-toggle').classList.toggle('collapsed', !open);
        this.needsRedraw = true;
    };

    Paint.prototype.setLibraryOpen = function (open) {
        this.libraryOpen = open;
        document.getElementById('brush-library').classList.toggle('collapsed', !open);
        document.getElementById('library-toggle').classList.toggle('collapsed', !open);
    };

    Paint.prototype.tipShape = function () {
        return this.tip;
    };

    // [atelier] 캔버스 결은 붓과 무관하므로 한 번만 만든다.
    Paint.prototype.ensureGrainTexture = function () {
        if (this.grainTexture !== null) return this.grainTexture;

        var wgl = this.wgl;
        var canvas = BrushTip.createGrain({ size: 256, threads: 34, seed: 7 });
        var pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);

        this.grainTexture = wgl.buildTexture(
            wgl.RGBA, wgl.UNSIGNED_BYTE, canvas.width, canvas.height,
            new Uint8Array(pixels.data.buffer),
            wgl.REPEAT, wgl.REPEAT, wgl.LINEAR, wgl.LINEAR);
        return this.grainTexture;
    };

    /**
     * [atelier] 결정적 난수.
     *
     * Math.random 을 쓰면 undo 후 다시 재생했을 때 획의 질감이 달라진다.
     * 획 시드와 dab 번호와 채널로만 값을 만든다. (조사 문서 §7)
     */
    function dabRandom (seed, index, channel) {
        var t = (Math.imul(seed, 73856093) ^ Math.imul(index, 19349663) ^ Math.imul(channel, 83492791)) | 0;
        t = Math.imul(t ^ (t >>> 13), 0x85ebca6b);
        t = Math.imul(t ^ (t >>> 16), 0xc2b2ae35);
        return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
    }

    // [atelier] 붓 끝 마스크를 텍스처로 올린다. 모양이 바뀔 때만 다시 만든다.
    Paint.prototype.ensureTipTexture = function (shape) {
        var key = [shape.hardness, shape.squareness, shape.bristles, shape.bristleDepth, shape.ragged, shape.seed].join('|');
        if (this.tipTexture !== null && this.tipKey === key) return this.tipTexture;

        var wgl = this.wgl;
        var canvas = BrushTip.createAtlas({
            size: 128,
            hardness: shape.hardness,
            squareness: shape.squareness,
            bristles: shape.bristles,
            bristleDepth: shape.bristleDepth,
            ragged: shape.ragged,
            seed: shape.seed
        });

        var pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        if (this.tipTexture !== null) wgl.deleteTexture(this.tipTexture);
        this.tipTexture = wgl.buildTexture(
            wgl.RGBA, wgl.UNSIGNED_BYTE, canvas.width, canvas.height,
            new Uint8Array(pixels.data.buffer),
            wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
        this.tipKey = key;
        return this.tipTexture;
    };

    /**
     * [atelier] 거리 기반 리샘플링.
     *
     * 원본은 프레임마다 한 번 찍었다. 그러면 120Hz 와 60Hz 에서 같은 손동작의
     * 농도가 달라지고, 느리게 그으면 뭉치고 빠르게 그으면 성겨진다.
     * 붓 반지름에 비례한 간격으로 다시 끊는다.
     *
     *   spacing = radius / dabsPerRadius
     */
    Paint.prototype.emitDabs = function (toX, toY, toPressure) {
        var fromX = this.lastDabX;
        var fromY = this.lastDabY;
        var dx = toX - fromX;
        var dy = toY - fromY;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 1e-4) return;

        // 붓이 향하는 각. 진행 방향을 얼마나 따를지는 붓마다 다르다.
        var travel = Math.atan2(dy, dx);
        var target = this.dabAngle + shortestAngle(this.dabAngle, travel) * this.angleFollow;
        // 천천히 그을 때 손떨림으로 붓이 팽그르르 도는 것을 막는다.
        this.strokeAngle += shortestAngle(this.strokeAngle, target) * 0.4;

        // 눕힐수록 넓은 면이 닿는다. 기울기가 없는 입력에서는 그대로다.
        var tiltAmount = Math.sin(this.penTilt);
        var aspect = Math.max(1.0, this.dabAspect * (1 + this.tiltAspect * tiltAmount));

        var spacing = Math.max(0.5, this.brushScale / this.dabsPerRadius);
        var travelled = spacing - this.dabCarry;

        while (travelled <= distance) {
            var t = travelled / distance;
            var x = fromX + dx * t;
            var y = fromY + dy * t;

            // 압력은 두 점 사이를 따라 이어진다. 한 걸음마다 뚝 끊기면 획이 계단이 된다.
            var pressure = this.lastPressure + (toPressure - this.lastPressure) * t;
            // 0 압력에서 지름이 0 이면 펜이 닿는 순간이 끊겨 보인다.
            var sizeFactor = this.pressureSize + (1 - this.pressureSize) * pressure;
            var flowFactor = this.pressureFlow + (1 - this.pressureFlow) * pressure;

            this.strokeDistance += spacing;

            // dab 마다 조금씩 어긋나게 한다. 이게 없으면 같은 자국이 줄을 맞춰
            // 획에 격자무늬가 생긴다.
            //
            // 다만 **어긋남이 백색잡음이면 붓결이 죽는다.** dab 마다 골 위치가
            // 따로 놀면 겹칠 때 서로를 메워, 긴 고랑 대신 사포 같은 잔 반짝임만
            // 남는다. 원본이 임파스토로 보였던 건 붓털 100 가닥이 한 획 내내
            // 같은 자리를 긁었기 때문이다.
            //
            // 그래서 진행 방향과 수직인 성분(골을 옆으로 뭉개는 것)은 천천히
            // 도는 값으로 두고, 진행 방향 성분만 백색잡음으로 둔다.
            var n = this.dabIndex++;
            var wobble = 0.6 * Math.sin(n * 0.19 + this.strokePhase)
                       + 0.4 * Math.sin(n * 0.073 + this.strokePhase * 2.3);
            var jitterAngle = wobble * this.angleJitter;
            var across = wobble * this.scatter * this.brushScale;
            var jitterRadius = 1 + (dabRandom(this.strokeSeed, n, 2) - 0.5) * 2 * this.radiusJitter;
            var along = (dabRandom(this.strokeSeed, n, 4) - 0.5) * this.scatter * this.brushScale;

            var ux = dx / distance, uy = dy / distance;

            this.dabQueue.push({
                x: x + ux * along - uy * across,
                y: y + uy * along + ux * across,
                radius: this.brushScale * sizeFactor * jitterRadius,
                aspect: aspect,
                angle: this.strokeAngle + jitterAngle,
                alpha: flowFactor,
                // 마스크 아틀라스 네 칸 중 하나. **한 획 안에서는 고정이다** —
                // dab 마다 바꾸면 붓털 배치가 매번 달라져 고랑이 이어지지 않는다.
                variant: this.strokeVariant,
                // 유체를 미는 방향. 붓이 간 쪽으로 물감이 끌린다.
                vx: ux,
                vy: uy
            });

            travelled += spacing;
        }

        this.dabCarry = distance - (travelled - spacing);
        this.lastDabX = toX;
        this.lastDabY = toY;
        this.lastPressure = toPressure;
    };

    function shortestAngle (from, to) {
        var delta = to - from;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        return delta;
    }

    // [atelier] 지금 든 붓이 캔버스 위에 떠 있는 높이.
    Paint.prototype.brushHeight = function () {
        return this.brushHeightScale * this.brushScale;
    };

    /**
     * [atelier] 패널 높이와 색상환 위치를 DOM 에서 잰다.
     *
     * 패널 배경은 WebGL 로 그리는데 그 안의 옵션들은 DOM 이다. 둘을 상수로
     * 맞춰 두면 옵션을 하나 넣을 때마다 손으로 다시 맞춰야 하고, 빠뜨리면
     * 색상환이 패널 밖으로 나간다. 그래서 DOM 이 자란 만큼 패널도 자라게 한다.
     */
    Paint.prototype.measurePanel = function () {
        var ui = document.getElementById('ui');
        var wheelSpace = document.getElementById('color-wheel-space');

        // 잴 때는 getBoundingClientRect 를 쓰지 않는다. 그건 transform 이 반영된
        // **화면상** 위치라서, 패널이 접혀 있거나 여닫는 애니메이션 중이면 엉뚱한
        // 값이 나온다. offsetTop/scrollHeight 는 배치 값이라 transform 과 무관하다.
        var height = ui
            // 내용이 창보다 길면 창 높이까지만 그린다. 나머지는 스크롤이 맡는다.
            ? Math.min(Math.ceil(ui.scrollHeight) + PANEL_BOTTOM_PADDING, this.canvas.height)
            : PANEL_HEIGHT_FALLBACK;

        var bottom = this.colorPicker ? this.colorPicker.bottom : 0;
        if (wheelSpace && ui) {
            // #ui 는 top: 0 이므로 offsetTop 에서 스크롤만 빼면 화면 y 가 된다.
            // 색상환은 아래에서부터 재는 좌표계다.
            var top = wheelSpace.offsetTop - ui.scrollTop;
            bottom = this.canvas.height - (top + wheelSpace.offsetHeight);
        }

        // 바뀐 게 없으면 다시 그릴 이유도 없다 — 이 함수는 매 프레임 불린다
        if (height === this.panelHeight && this.colorPicker && bottom === this.colorPicker.bottom) return;

        this.panelHeight = height;
        if (this.colorPicker) {
            this.colorPicker.bottom = bottom;
            // 패널을 넘어가는 부분은 그리지도, 클릭을 받지도 않는다
            this.colorPicker.clip = {
                left: 0,
                bottom: this.canvas.height - this.panelHeight,
                width: PANEL_WIDTH,
                height: this.panelHeight
            };
        }

        this.needsRedraw = true;
    };


    // ── [atelier] 물감 팔레트와 쓰던 색 ──────────────────────────
    //
    // 색상환은 정밀하지만 "그 색"을 다시 찾기가 어렵다. 유화는 정해진 안료를
    // 짜서 쓰는 그림이니 칸으로 두는 편이 실제 작업에 가깝다.

    Paint.prototype.buildPalette = function () {
        var paletteElement = document.getElementById('palette');
        var recentElement = document.getElementById('recent-colors');
        if (!paletteElement || !recentElement) return;

        this.paletteElement = paletteElement;
        this.recentElement = recentElement;

        for (var i = 0; i < PALETTE.length; ++i) {
            var entry = PALETTE[i];
            var swatch = document.createElement('div');
            swatch.className = 'swatch';
            // 엔진과 같은 변환으로 칠한다. 보이는 대로 칠해진다.
            swatch.style.background = this.cssForHsv(entry.hsv[0], entry.hsv[1], entry.hsv[2]);
            swatch.title = entry.name;
            swatch.addEventListener('click', this.pickPaletteColor.bind(this, entry.hsv));
            paletteElement.appendChild(swatch);
        }

        this.renderRecentColors();
        this.refreshPaletteSelection();
    };

    Paint.prototype.pickPaletteColor = function (hsv) {
        this.brushColorHSVA[0] = hsv[0];
        this.brushColorHSVA[1] = hsv[1];
        this.brushColorHSVA[2] = hsv[2];
        // 물감 양(알파)은 건드리지 않는다. 색만 바꾸는 것이다.
        this.needsRedraw = true;
    };

    Paint.prototype.refreshPaletteSelection = function () {
        if (!this.paletteElement) return;
        var current = this.brushColorHSVA;
        var swatches = this.paletteElement.children;
        for (var i = 0; i < swatches.length; ++i) {
            var hsv = PALETTE[i].hsv;
            // 색상환을 조금만 움직여도 선택이 풀려야 한다. 넉넉히 보면 거짓말이 된다.
            var same = Math.abs(hsv[0] - current[0]) < 0.004
                    && Math.abs(hsv[1] - current[1]) < 0.01
                    && Math.abs(hsv[2] - current[2]) < 0.01;
            swatches[i].classList.toggle('selected', same);
        }
    };

    /**
     * 방금 쓴 색을 기억한다.
     *
     * 획을 시작할 때 부른다 — 색상환을 돌리는 도중의 색이 아니라
     * **실제로 칠한 색**만 남아야 다시 찾을 수 있다.
     */
    Paint.prototype.rememberColor = function () {
        var hsv = [this.brushColorHSVA[0], this.brushColorHSVA[1], this.brushColorHSVA[2]];
        var css = this.cssForHsv(hsv[0], hsv[1], hsv[2]);

        for (var i = 0; i < this.recentColors.length; ++i) {
            if (this.recentColors[i].css === css) {
                // 이미 있는 색이면 맨 앞으로만 옮긴다
                this.recentColors.splice(i, 1);
                break;
            }
        }

        this.recentColors.unshift({ hsv: hsv, css: css });
        if (this.recentColors.length > RECENT_COLOR_SLOTS) this.recentColors.length = RECENT_COLOR_SLOTS;
        this.renderRecentColors();
    };

    Paint.prototype.renderRecentColors = function () {
        if (!this.recentElement) return;
        this.recentElement.innerHTML = '';

        for (var i = 0; i < RECENT_COLOR_SLOTS; ++i) {
            var swatch = document.createElement('div');
            if (i < this.recentColors.length) {
                swatch.className = 'swatch';
                swatch.style.background = this.recentColors[i].css;
                swatch.addEventListener('click', this.pickPaletteColor.bind(this, this.recentColors[i].hsv));
            } else {
                // 빈 칸도 자리를 지켜야 색을 쓸 때마다 줄이 흔들리지 않는다
                swatch.className = 'swatch empty';
            }
            this.recentElement.appendChild(swatch);
        }
    };


    // ── [atelier] 붓 커서 ────────────────────────────────────────
    //
    // 원본은 붓털을 와이어프레임으로 그려 그게 커서 노릇을 했다. 붓털을
    // 걷어내면서 같이 사라졌고, 그 뒤로 캔버스 위에서는 커서가 아예 없었다
    // (`cursor: none` 인데 대신 그리는 것이 없었다).
    //
    // 고정 붓이므로 발자국 하나면 된다. WebGL 패스를 더 만들지 않고 캔버스 위에
    // SVG 를 얹는다 — 마우스가 움직일 때마다 화면을 다시 그릴 이유가 없다.

    Paint.prototype.setUpBrushCursor = function () {
        this.brushCursor = document.getElementById('brush-cursor');
        if (!this.brushCursor) return;

        this.brushCursorRings = this.brushCursor.querySelectorAll('ellipse');
        // 펜과 손가락은 제 위치를 스스로 보여 준다. 마우스만 커서가 필요하다.
        this.pointerIsMouse = true;

        document.addEventListener('pointermove', (function (event) {
            this.pointerIsMouse = event.pointerType === 'mouse' || event.pointerType === undefined;
            this.moveBrushCursor(event.clientX, event.clientY);
        }).bind(this));

        document.addEventListener('pointerleave', (function () {
            this.brushCursor.classList.remove('visible');
        }).bind(this));

        this.updateBrushCursorShape();
    };

    Paint.prototype.moveBrushCursor = function (clientX, clientY) {
        if (!this.brushCursor) return;

        // 패널이나 브러시 목록 위에서는 일반 커서가 맞다.
        // 패널은 WebGL 로 캔버스에 그려서 DOM 으로 못 맞히므로 좌표로 본다.
        var overCanvas = this.pointerIsMouse
            && !(this.panelOpen && clientX < PANEL_WIDTH && clientY < this.panelHeight);

        if (overCanvas) {
            var library = document.getElementById('brush-library');
            if (library && this.libraryOpen) {
                var box = library.getBoundingClientRect();
                if (clientX > box.left && clientY < box.bottom) overCanvas = false;
            }
        }

        this.brushCursor.classList.toggle('visible', overCanvas);
        if (!overCanvas) return;

        this.brushCursor.style.transform = 'translate(' + clientX + 'px,' + clientY + 'px)';
        this.updateBrushCursorShape();
    };

    Paint.prototype.updateBrushCursorShape = function () {
        if (!this.brushCursor || !this.brushCursorRings) return;

        // 획 중이면 그때의 각을 쓴다. 멈춰 있으면 붓이 기본으로 놓인 각이다.
        var angle = this.interactionState === InteractionMode.PAINTING ? this.strokeAngle : this.dabAngle;
        var rx = this.brushScale / Math.max(1, this.dabAspect);
        var ry = this.brushScale;

        var size = Math.max(6, this.brushScale * 2 + 8);
        this.brushCursor.setAttribute('width', size);
        this.brushCursor.setAttribute('height', size);
        this.brushCursor.setAttribute('viewBox', (-size / 2) + ' ' + (-size / 2) + ' ' + size + ' ' + size);
        // transform 이 커서 끝을 가리키므로 SVG 를 반만큼 되돌려 중심을 맞춘다
        this.brushCursor.style.marginLeft = (-size / 2) + 'px';
        this.brushCursor.style.marginTop = (-size / 2) + 'px';

        for (var i = 0; i < this.brushCursorRings.length; ++i) {
            var ring = this.brushCursorRings[i];
            ring.setAttribute('rx', rx.toFixed(2));
            ring.setAttribute('ry', ry.toFixed(2));
            // 진행 방향이 긴 축이 아니라 **짧은** 축이다 (shaders/dab.vert 와 같은 규칙)
            ring.setAttribute('transform', 'rotate(' + (angle * 180 / Math.PI).toFixed(1) + ')');
        }
    };


    Paint.prototype.applyBrushPreset = function (preset) {
        this.brushScale = preset.radius;
        this.brushSizeSlider.setValue(preset.radius);

        // 고정 붓의 모양
        this.dabAspect = preset.aspect;
        this.dabAngle = preset.angle * Math.PI / 180;
        this.angleFollow = preset.angleFollow;
        this.dabsPerRadius = preset.dabsPerRadius;

        this.tip = {
            hardness: preset.hardness,
            squareness: preset.squareness,
            bristles: preset.bristles,
            bristleDepth: preset.bristleDepth,
            ragged: preset.ragged,
            seed: preset.seed || 1
        };

        this.scatter = preset.scatter;
        this.angleJitter = preset.angleJitter;
        this.radiusJitter = preset.radiusJitter;
        this.grainStrength = preset.grain;
        this.grainFadeAt = preset.grainFade;

        // 사양표의 Pickup·Drag 열이 여기로 온다. Blender 만 유독 높다 —
        // 새 색을 거의 안 내놓고 이미 있는 색만 섞는 붓이기 때문이다.
        this.thickness = preset.thick;
        this.paintDrag = preset.drag;
        this.smudge = preset.smudge;
        this.smudgeLength = preset.smudgeLength;
        this.smudgeRadius = preset.smudgeRadius;
        this.smudgeSlider.setValue(preset.smudge);

        this.flatnessSlider.setValue(Utilities.clamp((preset.aspect - 1) / 5, 0, 1));

        this.simulator.fluidity = preset.fluidity;
        this.fluiditySlider.setValue(preset.fluidity);

        this.brushColorHSVA[3] = preset.alpha;

        this.needsRedraw = true;
    };

    Paint.prototype.update = function () {
        // [atelier] 패널 안의 옵션은 DOM 이고 색상환은 WebGL 이다. 패널을 스크롤하면
        // 둘이 어긋나므로 매 프레임 맞춘다. scroll 이벤트에 걸어 두면 탭이 가려져
        // 있을 때처럼 이벤트가 오지 않는 경우에 어긋난 채로 남는다.
        // 값이 그대로면 measurePanel 은 아무 일도 하지 않는다.
        if (this.panelOpen) this.measurePanel();

        // [atelier] 쓰는 색이 바뀌면 목록의 획도 그 색으로 다시 긋는다.
        if (this.brushLibrary) {
            var color = this.brushCss();
            if (color !== this.libraryColor) {
                this.libraryColor = color;
                this.brushLibrary.setColor(color);
                this.refreshPaletteSelection();
                this.updateBrushCursorShape();
            }
        }

        var wgl = this.wgl;
        var canvas = this.canvas;
        var simulationFramebuffer = this.simulationFramebuffer;


        // [atelier] 붓털 갱신은 없다. 이번 프레임에 쌓인 dab 을 그대로 찍는다.
        if (this.dabQueue.length > 0) {
            var splatColor = hsvToRyb(this.brushColorHSVA[0], this.brushColorHSVA[1], this.brushColorHSVA[2]);

            // 한 dab 이 놓는 양. 간격이 촘촘할수록 같은 거리에 더 많이 겹치므로
            // 그만큼 한 번의 양을 줄여야 농도가 간격에 휘둘리지 않는다.
            // (libmypaint 의 opaque_linearize 가 보정하려는 것과 같은 문제다)
            var alpha = mix(DAB_MIN_ALPHA, DAB_MAX_ALPHA, this.brushColorHSVA[3]);

            // 간격이 촘촘할수록 같은 자리를 더 여러 번 덮으므로 한 번의 양을 줄인다.
            // 남는 비율은 (1-a) 의 곱으로 쌓이니 보정도 거듭제곱이어야 한다 —
            // 예전처럼 비례로 나누면 촘촘하게 둘 때 오히려 더 연해졌다.
            // (libmypaint 의 opaque_linearize 가 보정하려는 것과 같은 문제다)
            alpha = 1 - Math.pow(1 - alpha, REFERENCE_DABS_PER_RADIUS / this.dabsPerRadius);

            splatColor[3] = Utilities.clamp(alpha, 0.0, 1.0);

            var splatVelocityScale = SPLAT_VELOCITY_SCALE * splatColor[3] * this.resolutionScale
                * this.paintDrag * DRAG_SCALE;

            // 찍기 **전에** 붓 아래 색을 집어 온다. 물감 텍스처를 렌더 타깃으로
            // 쓰는 중에는 같이 읽을 수 없기 때문이다.
            if (this.smudge > 0) {
                // 붓이 지나온 자리를 따라가며 색을 집어 온다.
                //
                // 한 프레임에 dab 이 몇 개 쌓이느냐는 프레임레이트와 손 속도에 달렸다.
                // 그대로 한 번만 집어 오면 빠른 획에서 색 경계를 통째로 건너뛴다.
                // 그렇다고 dab 마다 1×1 패스를 돌리면 낭비다 — 어차피 이 프레임의
                // dab 들은 모두 같은 색으로 찍히기 때문이다.
                //
                // 그래서 획을 최대 SMUDGE_SAMPLES 구간으로 나눠 집어 오고,
                // 각 구간에는 그 구간이 품은 dab 수만큼 감쇠를 몰아 준다.
                // 같은 지수 감쇠를 n 번 적용한 것과 length^n 이 같다는 성질을 쓴다.
                var total = this.dabQueue.length;
                var steps = Math.min(SMUDGE_SAMPLES, total);
                var perStep = Math.pow(this.smudgeLength, total / steps);
                var pickupRadius = this.brushScale * this.smudgeRadius;

                for (var k = 0; k < steps; ++k) {
                    // 구간의 끝 dab 자리에서 집어 온다. Krita 의 Smearing 이
                    // **직전 붓 자리** 아래를 집어 오는 것과 같은 뜻이다 —
                    // 방금 놓은 물감이 아니라 지나온 자리라야 획이 번져 보인다.
                    var at = this.dabQueue[Math.min(total - 1, Math.floor((k + 1) * total / steps) - 1)];
                    // 붓 폭 방향은 진행 방향과 수직이다
                    this.simulator.updateSmudge(
                        at.x, at.y, pickupRadius, this.paintingRectangle, perStep,
                        -at.vy, at.vx);
                }
            }

            this.simulator.splatDabs(
                this.dabQueue, this.paintingRectangle, splatColor,
                this.ensureTipTexture(this.tipShape()), splatVelocityScale,
                { texture: this.ensureGrainTexture(), scale: this.grainScale, strength: this.grainStrength, fadeAt: this.grainFadeAt },
                // 두께는 실제로 얹힌 물감 양에 비례한다. 색 농도와 값은 따로 두되
                // 연동은 유지한다 — 연하게 칠한 자리가 두껍게 솟으면 안 된다.
                this.smudge, splatColor[3] * this.thickness * THICKNESS_SCALE, this.relief);

            this.dabQueue.length = 0;
        }

        var simulationUpdated = this.simulator.simulate();

        if (simulationUpdated) this.needsRedraw = true;


        //the rectangle we end up drawing the painting into
        var clippedPaintingRectangle = (this.interactionState === InteractionMode.RESIZING ? this.newPaintingRectangle : this.paintingRectangle).clone()
                                           .intersectRectangle(new Rectangle(0, 0, this.canvas.width, this.canvas.height));

        if (this.needsRedraw) {
            //draw painting into texture

            wgl.framebufferTexture2D(this.framebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.canvasTexture, 0);
            var clearState = wgl.createClearState()
                .bindFramebuffer(this.framebuffer)
                .clearColor(BACKGROUND_GRAY, BACKGROUND_GRAY, BACKGROUND_GRAY, 1.0);

            wgl.clear(clearState, wgl.COLOR_BUFFER_BIT | wgl.DEPTH_BUFFER_BIT);


            var paintingProgram;

            if (this.colorModel === ColorModel.RYB) {
                paintingProgram = this.interactionState === InteractionMode.RESIZING ? this.resizingPaintingProgram : this.paintingProgram;
            } else if (this.colorModel === ColorModel.RGB) {
                paintingProgram = this.interactionState === InteractionMode.RESIZING ? this.resizingPaintingProgramRGB : this.paintingProgramRGB;
            }

            var paintingDrawState = wgl.createDrawState()
                .bindFramebuffer(this.framebuffer)
                .vertexAttribPointer(this.quadVertexBuffer, paintingProgram.getAttribLocation('a_position'), 2, wgl.FLOAT, false, 0, 0)
                .useProgram(paintingProgram)
                .uniform1f('u_featherSize', RESIZING_FEATHER_SIZE)

                .uniform1f('u_normalScale', NORMAL_SCALE / this.resolutionScale)
                .uniform1f('u_roughness', this.roughness)
                .uniform1f('u_diffuseScale', this.diffuseScale)
                .uniform1f('u_specularScale', this.specularScale)
                .uniform1f('u_F0', F0)
                .uniform3f('u_lightDirection', LIGHT_DIRECTION[0], LIGHT_DIRECTION[1], LIGHT_DIRECTION[2])

                .uniform2f('u_paintingPosition', this.paintingRectangle.left, this.paintingRectangle.bottom)
                .uniform2f('u_paintingResolution', this.simulator.resolutionWidth, this.simulator.resolutionHeight)
                .uniform2f('u_paintingSize', this.paintingRectangle.width, this.paintingRectangle.height)
                .uniform2f('u_screenResolution', this.canvas.width, this.canvas.height)
                .uniformTexture('u_paintTexture', 0, wgl.TEXTURE_2D, this.simulator.paintTexture)

                .viewport(clippedPaintingRectangle.left, clippedPaintingRectangle.bottom, clippedPaintingRectangle.width, clippedPaintingRectangle.height);

            wgl.drawArrays(paintingDrawState, wgl.TRIANGLE_STRIP, 0, 4);

        }

        //output painting to screen
        var outputDrawState = wgl.createDrawState()
          .viewport(0, 0, this.canvas.width, this.canvas.height)
          .useProgram(this.outputProgram)
          .uniformTexture('u_input', 0, wgl.TEXTURE_2D, this.canvasTexture)
          .vertexAttribPointer(this.quadVertexBuffer, 0, 2, wgl.FLOAT, wgl.FALSE, 0, 0);

        wgl.drawArrays(outputDrawState, wgl.TRIANGLE_STRIP, 0, 4);


        this.drawShadow(PAINTING_SHADOW_ALPHA, clippedPaintingRectangle); //draw painting shadow



        // [atelier] 붓털 와이어프레임 커서는 없앴다. 붓털이 없기 때문이다.


        //work out what cursor we want
        var desiredCursor = '';

        if (this.colorPicker.isInUse()) {
            desiredCursor = 'pointer';
        } else if (this.colorPicker.overControl(this.mouseX, this.mouseY)) {
            desiredCursor = 'pointer';
        } else if (this.interactionState === InteractionMode.NONE) { //if there is no current interaction, we display a cursor based on what interaction would occur on click
            var desiredMode = this.desiredInteractionMode(this.mouseX, this.mouseY);

            if (desiredMode === InteractionMode.PAINTING) {
                desiredCursor = 'none';
            } else if (desiredMode === InteractionMode.RESIZING) {
                desiredCursor = cursorForResizingSide(this.getResizingSide(this.mouseX, this.mouseY));
            } else if (desiredMode === InteractionMode.PANNING) {
                desiredCursor = 'pointer';
            } else {
                desiredCursor = 'default';
            }
        } else { //if there is an interaction going on, display appropriate cursor
            if (this.interactionState === InteractionMode.PAINTING) {
                desiredCursor = 'none';
            } else if (this.interactionState === InteractionMode.RESIZING) {
                desiredCursor = cursorForResizingSide(this.resizingSide);
            } else if (this.interactionState === InteractionMode.PANNING) {
                desiredCursor = 'pointer';
            }
        }

        if (this.canvas.style.cursor !== desiredCursor) { //don't thrash the style
            this.canvas.style.cursor = desiredCursor;
        }


        if (!this.panelOpen) { // [atelier] 접혀 있으면 패널도 색상환도 그리지 않는다
            this.needsRedraw = false;
            return;
        }

        var panelBottom = this.canvas.height - this.panelHeight;

        if (this.needsRedraw) {
            //blur the canvas for the panel

            var BLUR_FEATHER = ((PANEL_BLUR_SAMPLES - 1) / 2) * PANEL_BLUR_STRIDE;

            var blurDrawState = wgl.createDrawState()
                .useProgram(this.blurProgram)
                .viewport(
                    0,
                    Utilities.clamp(panelBottom - BLUR_FEATHER, 0, this.canvas.height),
                    PANEL_WIDTH + BLUR_FEATHER,
                    this.panelHeight + BLUR_FEATHER)
                .bindFramebuffer(this.framebuffer)
                .uniform2f('u_resolution', this.canvas.width, this.canvas.height)
                .vertexAttribPointer(this.quadVertexBuffer, 0, 2, wgl.FLOAT, wgl.FALSE, 0, 0);


            wgl.framebufferTexture2D(this.framebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.tempCanvasTexture, 0);
            blurDrawState.uniformTexture('u_input', 0, wgl.TEXTURE_2D, this.canvasTexture)
                .uniform2f('u_step', PANEL_BLUR_STRIDE, 0);

            wgl.drawArrays(blurDrawState, wgl.TRIANGLE_STRIP, 0, 4);


            wgl.framebufferTexture2D(this.framebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.blurredCanvasTexture, 0);
            blurDrawState.uniformTexture('u_input', 0, wgl.TEXTURE_2D, this.tempCanvasTexture)
                .uniform2f('u_step', 0, PANEL_BLUR_STRIDE);

            wgl.drawArrays(blurDrawState, wgl.TRIANGLE_STRIP, 0, 4);
        }

        
        //draw panel to screen

        var panelDrawState = wgl.createDrawState()
            .viewport(0, panelBottom, PANEL_WIDTH, this.panelHeight)
            .uniformTexture('u_canvasTexture', 0, wgl.TEXTURE_2D, this.blurredCanvasTexture)
            .uniform2f('u_canvasResolution', this.canvas.width, this.canvas.height)
            .uniform2f('u_panelResolution', PANEL_WIDTH, this.panelHeight)
            .useProgram(this.panelProgram)
            .vertexAttribPointer(this.quadVertexBuffer, 0, 2, wgl.FLOAT, wgl.FALSE, 0, 0);

        wgl.drawArrays(panelDrawState, wgl.TRIANGLE_STRIP, 0, 4);


        this.drawShadow(PANEL_SHADOW_ALPHA, new Rectangle(0, panelBottom, PANEL_WIDTH, this.panelHeight)); //shadow for panel
        

        this.needsRedraw = false;

        this.colorPicker.draw(this.colorModel === ColorModel.RGB, this.colorPicker.clip);


        //this.brushViewer.draw(this.brushX, this.brushY, this.brush);
    };


    Paint.prototype.clear = function () {
        this.simulator.clear();

        this.needsRedraw = true;
    };


    Paint.prototype.saveSnapshot = function () {
        if (this.snapshotIndex === HISTORY_SIZE) { //no more room in the snapshots
            //the last shall be first and the first shall be last...
            var front = this.snapshots.shift();
            this.snapshots.push(front);

            this.snapshotIndex -= 1;
        }

        this.undoing = false;

        var snapshot = this.snapshots[this.snapshotIndex]; //the snapshot to save into

        if (snapshot.getTextureWidth() !== this.simulator.resolutionWidth || snapshot.getTextureHeight() !== this.simulator.resolutionHeight) { //if we need to resize the snapshot's texture
            wgl.rebuildTexture(snapshot.texture, wgl.RGBA, wgl.FLOAT, this.simulator.resolutionWidth, this.simulator.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
        }

        this.simulator.copyPaintTexture(snapshot.texture);

        snapshot.paintingWidth = this.paintingRectangle.width;
        snapshot.paintingHeight = this.paintingRectangle.height;
        snapshot.resolutionScale = this.resolutionScale;

        this.snapshotIndex += 1;


        this.refreshDoButtons();
    };

    Paint.prototype.applySnapshot = function (snapshot) {
        this.paintingRectangle.width = snapshot.paintingWidth;
        this.paintingRectangle.height = snapshot.paintingHeight;

        if (this.resolutionScale !== snapshot.resolutionScale) {
            for (var i = 0; i < QUALITIES.length; ++i) {
                if (QUALITIES[i].resolutionScale === snapshot.resolutionScale) {
                    this.qualityButtons.setIndex(i);
                }
            }

            this.resolutionScale = snapshot.resolutionScale;
        }

        if (this.simulator.width !== this.getPaintingResolutionWidth() || this.simulator.height !== this.getPaintingResolutionHeight()) {
            this.simulator.changeResolution(this.getPaintingResolutionWidth(), this.getPaintingResolutionHeight());
        }

        this.simulator.applyPaintTexture(snapshot.texture);
    };

    Paint.prototype.canUndo = function () {
        return this.snapshotIndex >= 1;
    };

    Paint.prototype.canRedo = function () {
        return this.undoing && this.snapshotIndex <= this.maxRedoIndex - 1;
    };

    Paint.prototype.undo = function () {
        if (!this.undoing) {
            this.saveSnapshot();

            this.undoing = true;

            this.snapshotIndex -= 1;

            this.maxRedoIndex = this.snapshotIndex;
        }

        if (this.canUndo()) {
            this.applySnapshot(this.snapshots[this.snapshotIndex - 1]);

            this.snapshotIndex -= 1;
        }

        this.refreshDoButtons();

        this.needsRedraw = true;
    };

    Paint.prototype.redo = function () {
        if (this.canRedo()) {
            this.applySnapshot(this.snapshots[this.snapshotIndex + 1]);

            this.snapshotIndex += 1;

        }

        this.refreshDoButtons();

        this.needsRedraw = true;
    };

    Paint.prototype.refreshDoButtons = function () {
        if (this.canUndo()) {
            this.undoButton.className = 'button do-button-active';
        } else {
            this.undoButton.className = 'button do-button-inactive';
        }

        if (this.canRedo()) {
            this.redoButton.className = 'button do-button-active';
        } else {
            this.redoButton.className = 'button do-button-inactive';
        }
    };

    Paint.prototype.save = function () {
        //we first render the painting to a WebGL texture

        var wgl = this.wgl;

        var saveWidth = this.paintingRectangle.width;
        var saveHeight = this.paintingRectangle.height;

        var saveTexture = wgl.buildTexture(wgl.RGBA, wgl.UNSIGNED_BYTE, saveWidth, saveHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);

        var saveFramebuffer = wgl.createFramebuffer();
        wgl.framebufferTexture2D(saveFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, saveTexture, 0);

        var paintingProgram = this.colorModel === ColorModel.RYB ? this.savePaintingProgram : this.savePaintingProgramRGB;

        var saveDrawState = wgl.createDrawState()
            .bindFramebuffer(saveFramebuffer)
            .viewport(0, 0, saveWidth, saveHeight)
            .vertexAttribPointer(this.quadVertexBuffer, paintingProgram.getAttribLocation('a_position'), 2, wgl.FLOAT, false, 0, 0)
            .useProgram(paintingProgram)
            .uniform2f('u_paintingSize', this.paintingRectangle.width, this.paintingRectangle.height)
            .uniform2f('u_paintingResolution', this.simulator.resolutionWidth, this.simulator.resolutionHeight)
            .uniform2f('u_screenResolution', this.paintingRectangle.width, this.paintingRectangle.height)
            .uniform2f('u_paintingPosition', 0, 0)
            .uniformTexture('u_paintTexture', 0, wgl.TEXTURE_2D, this.simulator.paintTexture)

            .uniform1f('u_normalScale', NORMAL_SCALE / this.resolutionScale)
            .uniform1f('u_roughness', this.roughness)
            .uniform1f('u_diffuseScale', this.diffuseScale)
            .uniform1f('u_specularScale', this.specularScale)
            .uniform1f('u_F0', F0)
            .uniform3f('u_lightDirection', LIGHT_DIRECTION[0], LIGHT_DIRECTION[1], LIGHT_DIRECTION[2]);


        wgl.drawArrays(saveDrawState, wgl.TRIANGLE_STRIP, 0, 4);

        //then we read back this texture

        var savePixels = new Uint8Array(saveWidth * saveHeight * 4);
        wgl.readPixels(wgl.createReadState().bindFramebuffer(saveFramebuffer),
                        0, 0, saveWidth, saveHeight, wgl.RGBA, wgl.UNSIGNED_BYTE, savePixels);


        wgl.deleteTexture(saveTexture);
        wgl.deleteFramebuffer(saveFramebuffer);


        //then we draw the pixels to a 2D canvas and then save from the canvas
        //is there a better way?

        var saveCanvas = document.createElement('canvas');
        saveCanvas.width = saveWidth;
        saveCanvas.height = saveHeight;
        var saveContext = saveCanvas.getContext('2d');

        var imageData = saveContext.createImageData(saveWidth, saveHeight);
        imageData.data.set(savePixels);
        saveContext.putImageData(imageData, 0, 0);

        window.open(saveCanvas.toDataURL());
    };

    /**
     * [atelier] 펜에서 압력과 기울기를 읽는다.
     *
     * Safari 18.2 부터 Apple Pencil 의 altitudeAngle / azimuthAngle 을 준다.
     * 그 전 브라우저와 Chrome 계열은 tiltX / tiltY(도)를 주므로 환산해 쓴다.
     */
    Paint.prototype.readPen = function (event) {
        if (event.pointerType !== 'pen') {
            this.penPressure = MOUSE_PRESSURE;
            this.penTilt = 0;
            return;
        }

        this.hasPenInput = true;
        if (event.pressure > 0) this.penPressure = event.pressure;

        if (typeof event.altitudeAngle === 'number' && typeof event.azimuthAngle === 'number') {
            // altitude 는 화면에서 잰 각이라 수직에서 잰 각으로 바꾼다.
            this.penTilt = Math.max(0, Math.PI / 2 - event.altitudeAngle);
            this.penAzimuth = event.azimuthAngle;
            return;
        }

        var tiltX = (event.tiltX || 0) * Math.PI / 180;
        var tiltY = (event.tiltY || 0) * Math.PI / 180;
        if (tiltX === 0 && tiltY === 0) {
            this.penTilt = 0;
            this.penAzimuth = 0;
            return;
        }
        var ax = Math.tan(tiltX), ay = Math.tan(tiltY);
        this.penTilt = Math.atan(Math.sqrt(ax * ax + ay * ay));
        this.penAzimuth = Math.atan2(ay, ax);
    };

    Paint.prototype.onPointerDown = function (event) {
        this.readPen(event);
    };

    Paint.prototype.onPointerUp = function (event) {
        this.readPen(event);
        this.penFilter.started = false;
    };

    Paint.prototype.onPointerMove = function (event) {
        this.readPen(event);
        if (this.interactionState !== InteractionMode.PAINTING) return;

        // 한 번의 pointermove 사이에 기기가 모아 둔 표본을 전부 쓴다.
        // 이게 없으면 빠르게 그을 때 중간 점이 버려져 획이 각져 보인다.
        var samples = (typeof event.getCoalescedEvents === 'function') ? event.getCoalescedEvents() : [];
        if (samples.length === 0) samples = [event];

        for (var i = 0; i < samples.length; ++i) {
            var sample = samples[i];
            this.readPen(sample);

            var position = Utilities.getMousePosition(sample, this.canvas);
            var time = sample.timeStamp || event.timeStamp || performance.now();

            // 1€ 필터로 손떨림을 잡는다. 압력은 훨씬 약하게 건다.
            var filtered = this.penFilter.filter(
                position.x, this.canvas.height - position.y, this.penPressure, time);

            this.emitDabs(filtered.x, filtered.y, Utilities.clamp(filtered.pressure, 0.02, 1.0));
        }
    };

    Paint.prototype.onMouseMove = function (event) {
        if (event.preventDefault) event.preventDefault();

        var position = Utilities.getMousePosition(event, this.canvas);

        var mouseX = position.x;
        var mouseY = this.canvas.height - position.y;

        this.brushX = mouseX;
        this.brushY = mouseY;


        // [atelier] dab 은 포인터 이벤트에서 만든다 (압력·기울기와 합쳐진 표본을 쓰려고).

        if (this.interactionState === InteractionMode.PANNING) {
            var deltaX = mouseX - this.mouseX;
            var deltaY = mouseY - this.mouseY;

            this.paintingRectangle.left += deltaX;
            this.paintingRectangle.bottom += deltaY;

            this.paintingRectangle.left = Utilities.clamp(this.paintingRectangle.left, -this.paintingRectangle.width, this.canvas.width);
            this.paintingRectangle.bottom = Utilities.clamp(this.paintingRectangle.bottom, -this.paintingRectangle.height, this.canvas.height);

            this.needsRedraw = true;
        } else if (this.interactionState === InteractionMode.RESIZING) {
            if (this.resizingSide === ResizingSide.LEFT || this.resizingSide === ResizingSide.TOP_LEFT || this.resizingSide === ResizingSide.BOTTOM_LEFT) {
                this.newPaintingRectangle.left = Utilities.clamp(mouseX,
                    this.paintingRectangle.getRight() - this.maxPaintingWidth,
                    this.paintingRectangle.getRight() - MIN_PAINTING_WIDTH);
                this.newPaintingRectangle.width = this.paintingRectangle.left + this.paintingRectangle.width - this.newPaintingRectangle.left;
            }
            
            if (this.resizingSide === ResizingSide.RIGHT || this.resizingSide === ResizingSide.TOP_RIGHT || this.resizingSide === ResizingSide.BOTTOM_RIGHT) {
                this.newPaintingRectangle.width = Utilities.clamp(mouseX - this.paintingRectangle.left, MIN_PAINTING_WIDTH, this.maxPaintingWidth);
            }
            
            if (this.resizingSide === ResizingSide.BOTTOM || this.resizingSide === ResizingSide.BOTTOM_LEFT || this.resizingSide === ResizingSide.BOTTOM_RIGHT) {
                this.newPaintingRectangle.bottom = Utilities.clamp(mouseY,
                    this.paintingRectangle.getTop() - this.maxPaintingWidth,
                    this.paintingRectangle.getTop() - MIN_PAINTING_WIDTH);

                this.newPaintingRectangle.height = this.paintingRectangle.bottom + this.paintingRectangle.height - this.newPaintingRectangle.bottom;
            }
            
            if (this.resizingSide === ResizingSide.TOP || this.resizingSide === ResizingSide.TOP_LEFT || this.resizingSide === ResizingSide.TOP_RIGHT) {
                this.newPaintingRectangle.height = Utilities.clamp(mouseY - this.paintingRectangle.bottom, MIN_PAINTING_WIDTH, this.maxPaintingWidth);
            }

            this.needsRedraw = true;
        }

        if (this.panelOpen) this.colorPicker.onMouseMove(position.x, this.canvas.height - position.y);


        this.mouseX = mouseX;
        this.mouseY = mouseY;
    };


    Paint.prototype.getResizingSide = function (mouseX, mouseY) { //the side we'd be resizing with the current mouse position
        //we can resize if our perpendicular distance to an edge is less than RESIZING_RADIUS


        if (Math.abs(mouseX - this.paintingRectangle.left) <= RESIZING_RADIUS && Math.abs(mouseY - this.paintingRectangle.getTop()) <= RESIZING_RADIUS) { //top left
            return ResizingSide.TOP_LEFT;
        }

        if (Math.abs(mouseX - this.paintingRectangle.getRight()) <= RESIZING_RADIUS && Math.abs(mouseY - this.paintingRectangle.getTop()) <= RESIZING_RADIUS) { //top right
            return ResizingSide.TOP_RIGHT;
        }

        if (Math.abs(mouseX - this.paintingRectangle.left) <= RESIZING_RADIUS && Math.abs(mouseY - this.paintingRectangle.bottom) <= RESIZING_RADIUS) { //bottom left
            return ResizingSide.BOTTOM_LEFT;
        }

        if (Math.abs(mouseX - this.paintingRectangle.getRight()) <= RESIZING_RADIUS && Math.abs(mouseY - this.paintingRectangle.bottom) <= RESIZING_RADIUS) { //bottom right
            return ResizingSide.BOTTOM_RIGHT;
        }


        if (mouseY > this.paintingRectangle.bottom && mouseY <= this.paintingRectangle.getTop()) { //left or right
            if (Math.abs(mouseX - this.paintingRectangle.left) <= RESIZING_RADIUS) { //left
                return ResizingSide.LEFT;
            } else if (Math.abs(mouseX - this.paintingRectangle.getRight()) <= RESIZING_RADIUS) { //right
                return ResizingSide.RIGHT;
            }
        }
        
        if (mouseX > this.paintingRectangle.left && mouseX <= this.paintingRectangle.getRight()) { //bottom or top
            if (Math.abs(mouseY - this.paintingRectangle.bottom) <= RESIZING_RADIUS) { //bottom
                return ResizingSide.BOTTOM;
            } else if (Math.abs(mouseY - this.paintingRectangle.getTop()) <= RESIZING_RADIUS) { //top
                return ResizingSide.TOP;
            }
        }

        return ResizingSide.NONE;
    };

    //what interaction mode would be triggered if we clicked with given mouse position
    Paint.prototype.desiredInteractionMode = function (mouseX, mouseY) { 
        var mouseOverPanel = this.panelOpen
            && mouseX < PANEL_WIDTH && mouseY > this.canvas.height - this.panelHeight;

        if (mouseOverPanel) {
            return InteractionMode.NONE;
        } else if (this.spaceDown || this.mouseX < this.paintingRectangle.left - RESIZING_RADIUS || this.mouseX > this.paintingRectangle.left + this.paintingRectangle.width + RESIZING_RADIUS || this.mouseY < this.paintingRectangle.bottom - RESIZING_RADIUS || this.mouseY > this.paintingRectangle.bottom + this.paintingRectangle.height + RESIZING_RADIUS) {
            return InteractionMode.PANNING;
        } else if (this.getResizingSide(mouseX, mouseY) !== ResizingSide.NONE) {
            return InteractionMode.RESIZING;
        } else {
            return InteractionMode.PAINTING;
        }
    };

    Paint.prototype.onMouseDown = function (event) {
        if (event.preventDefault) event.preventDefault();
        if ('button' in event && event.button !== 0) return; //only handle left clicks

        var position = Utilities.getMousePosition(event, this.canvas);

        var mouseX = position.x;
        var mouseY = this.canvas.height - position.y;

        this.mouseX = mouseX;
        this.mouseY = mouseY;

        this.brushX = mouseX;
        this.brushY = mouseY;

        if (this.panelOpen) this.colorPicker.onMouseDown(mouseX, mouseY);

        if (!this.colorPicker.isInUse()) {

            var mode = this.desiredInteractionMode(mouseX, mouseY);

            if (mode === InteractionMode.PANNING) {
                this.interactionState = InteractionMode.PANNING;
            } else if (mode === InteractionMode.RESIZING) {
                this.saveSnapshot();

                this.interactionState = InteractionMode.RESIZING;

                this.resizingSide = this.getResizingSide(mouseX, mouseY);

                this.newPaintingRectangle = this.paintingRectangle.clone();

            } else if (mode === InteractionMode.PAINTING) {
                this.interactionState = InteractionMode.PAINTING;

                // [atelier] 획을 시작한다. 거리 리샘플링 상태를 새로 잡고 첫 dab 을 놓는다.
                this.lastDabX = mouseX;
                this.lastDabY = mouseY;
                this.dabCarry = 0;
                this.strokeDistance = 0;
                this.strokeAngle = this.dabAngle;
                this.strokeSeed = (Math.random() * 0x7fffffff) | 0;
                // 이 획 동안 쓸 붓털 배치와 흔들림 위상. 획 안에서는 바뀌지 않는다.
                this.strokeVariant = Math.floor(dabRandom(this.strokeSeed, 0, 0) * 4) % 4;
                this.strokePhase = dabRandom(this.strokeSeed, 0, 5) * Math.PI * 2;
                this.dabIndex = 0;
                this.lastPressure = this.penPressure;
                this.penFilter.reset(mouseX, mouseY, this.penPressure, performance.now());
                // 새 획은 깨끗한 붓으로 시작한다. 안 닦으면 지난 획의 색을 끌고 온다.
                this.simulator.clearSmudge();
                // 색상환을 돌리는 도중이 아니라 **실제로 칠한** 색만 기억한다
                this.rememberColor();

                var startSize = this.pressureSize + (1 - this.pressureSize) * this.penPressure;
                var startFlow = this.pressureFlow + (1 - this.pressureFlow) * this.penPressure;
                this.dabQueue.push({
                    x: mouseX, y: mouseY,
                    radius: this.brushScale * startSize,
                    aspect: this.dabAspect,
                    angle: this.strokeAngle,
                    alpha: startFlow,
                    variant: this.strokeVariant,
                    vx: 0, vy: 0
                });

                this.saveSnapshot();
            }
        }
    };

    Paint.prototype.onMouseUp = function (event) {
        if (event.preventDefault) event.preventDefault();

        var position = Utilities.getMousePosition(event, this.canvas);

        if (this.panelOpen) this.colorPicker.onMouseUp(position.x, this.canvas.height - position.y);

        if (this.interactionState === InteractionMode.RESIZING) { //if we're stopping the resize
            //resize simulator

            var offsetX = 0, offsetY = 0;

            if (this.resizingSide === ResizingSide.LEFT || this.resizingSide === ResizingSide.TOP_LEFT || this.resizingSide === ResizingSide.BOTTOM_LEFT) {
                offsetX = (this.paintingRectangle.left - this.newPaintingRectangle.left) * this.resolutionScale;
            }
            
            if (this.resizingSide === ResizingSide.BOTTOM || this.resizingSide === ResizingSide.BOTTOM_LEFT || this.resizingSide === ResizingSide.BOTTOM_RIGHT) {
                offsetY = (this.paintingRectangle.bottom - this.newPaintingRectangle.bottom) * this.resolutionScale;
            }

            this.paintingRectangle = this.newPaintingRectangle;

            this.simulator.resize(this.getPaintingResolutionWidth(), this.getPaintingResolutionHeight(), offsetX, offsetY, RESIZING_FEATHER_SIZE);

            
            this.needsRedraw = true;
        }

        this.interactionState = InteractionMode.NONE;
    };

    Paint.prototype.onMouseOver = function (event) {
        event.preventDefault();

        var position = Utilities.getMousePosition(event, this.canvas);

        var mouseX = position.x;
        var mouseY = this.canvas.height - position.y;

        this.brushX = mouseX;
        this.brushY = mouseY;


        // [atelier] 붓털 초기화 없음
    };

    Paint.prototype.onWheel = function (event) {
        event.preventDefault();

        // [atelier] 패널 위에서는 붓 크기가 아니라 패널을 굴린다.
        //
        // 패널(#ui)은 pointer-events: none 이라 휠을 직접 못 받는다. auto 로 두면
        // 밑의 캔버스에 그린 색상환을 집을 수 없게 되므로, 스크롤만 여기서 대신한다.
        if (this.panelOpen && event.clientX < PANEL_WIDTH && event.clientY < this.panelHeight) {
            var ui = document.getElementById('ui');
            if (ui && ui.scrollHeight > ui.clientHeight) {
                ui.scrollTop += event.deltaY;
                this.measurePanel();
                return;
            }
        }

        var scrollDelta = event.deltaY < 0.0 ? -1.0 : 1.0;

        this.brushScale = Utilities.clamp(this.brushScale + scrollDelta * -5.0, MIN_BRUSH_SCALE, MAX_BRUSH_SCALE);

        this.brushSizeSlider.setValue(this.brushScale);
    };


    Paint.prototype.onTouchStart = function (event) {
        event.preventDefault();

        if (event.touches.length === 1) { //if this is the first touch

            this.onMouseDown(event.targetTouches[0]);

            //if we've just started painting then we need to initialize the brush at the touch location
            if (this.interactionState === InteractionMode.PAINTING) {
                // [atelier] 붓털 초기화 없음
            }
        } else if (event.touches.length === 2) { //if this is the second touch
            if (this.interactionState === InteractionMode.PAINTING) {
                this.interactionState = InteractionMode.PANNING; //switch to panning if we were already painting
            }
        }
    };

    Paint.prototype.onTouchMove = function (event) {
        event.preventDefault();

        this.onMouseMove(event.targetTouches[0]);
    };

    Paint.prototype.onTouchEnd = function (event) {
        event.preventDefault();

        if (event.touches.length > 0) return; //don't fire if there are still touches remaining

        this.onMouseUp({});
    };

    Paint.prototype.onTouchCancel = function (event) {
        event.preventDefault();

        if (event.touches.length > 0) return; //don't fire if there are still touches remaining

        this.onMouseUp({});
    };

    return Paint;
}());
