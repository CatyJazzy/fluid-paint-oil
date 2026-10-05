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


    var INITIAL_PADDING = 100;
    var MIN_PAINTING_WIDTH = 300;
    var MAX_PAINTING_WIDTH = 4096; //this is further constrained by the maximum texture size

    //brush parameters
    var MAX_BRISTLE_COUNT = 100;
    var MIN_BRISTLE_COUNT = 10;
    var MIN_BRUSH_SCALE = 5;
    var MAX_BRUSH_SCALE = 75;
    // [atelier] 붓 몸통이 캔버스에서 떠 있는 높이 (brushScale 배). 붓털 길이는 4.5 다.
    //
    // 원본은 2.0 고정이었다. 붓털 길이 4.5 중 2.5 가 캔버스 아래로 박히는 셈이라,
    // 평면 제약에 밀린 붓털이 옆으로 누우면서 어떤 획을 그어도 붓털 옆면이
    // 빗처럼 통째로 드러났다. 실제로는 붓을 세워 쓰기도 하고, 그때는 붓 끝만
    // 눌려 결이 약간 보일 뿐이다. 그래서 값으로 연다.
    var BRUSH_HEIGHT_LAID = 2.0;      //눕힌 붓 (원본과 같다)
    var BRUSH_HEIGHT_UPRIGHT = 4.05;  //세운 붓. 붓 끝만 닿는다
    var INITIAL_UPRIGHT = 0.3;

    var MAX_TILT = 0.9; //라디안. 약 52도

    // [atelier] 붓털 열 마디 중 형태를 유지하는 마디 수. 1 이면 원본이다.
    var INITIAL_PINNED = 6;
    var Z_THRESHOLD = 0.13333; //this is scaled with the brushScale


    //splatting parameters
    // [atelier] 붓이 유체를 미는 힘. 원본은 0.14 고정이다.
    //
    // 이게 세면 물감이 붓을 따라 콧물처럼 늘어지고, 원을 그리면 가운데가
    // 소용돌이처럼 파여 빈다. 물감을 끌고 가는 맛은 여기서 나오지만
    // 원본 값은 유화보다는 물엿에 가깝다.
    var SPLAT_VELOCITY_SCALE = 0.14;
    // [atelier] 붓을 한 번에 얼마나 옮길지 (붓 반지름 대비). 잘게 나눌수록
    // 빠른 획이 느린 획과 비슷해지지만 붓 시뮬레이션을 그만큼 여러 번 돌린다.
    var BRUSH_STEP = 0.30;
    var MAX_BRUSH_STEPS = 6;

    // [atelier] 유체를 미는 붓털 속도의 상한 (붓 반지름 대비)
    var BRUSH_SPEED_CLAMP = 0.5;

    var INITIAL_SLIP = 0.3; //0~1 을 0~SPLAT_VELOCITY_SCALE 로 옮긴다

    // [atelier] 붓털 밀도 분포. 0.5 가 원본(면적당 균일), 높을수록 가운데가 빽빽.
    var INITIAL_DENSITY = 0.65;
    var SPLAT_RADIUS = 0.05;

    //for thin brush (fewest bristles)
    var THIN_MIN_ALPHA = 0.002;
    var THIN_MAX_ALPHA = 0.08;

    //for thick brush (most bristles)
    var THICK_MIN_ALPHA = 0.002;
    var THICK_MAX_ALPHA = 0.025;


    //panel is aligned with the top left
    var PANEL_WIDTH = 300;
        // [atelier] 패널 배경과 색상환은 WebGL 로 그리는데 그 안의 옵션은 DOM 이다.
    // 둘이 상수로 묶여 있어서 슬라이더를 하나 넣을 때마다 브라우저에서 재서
    // 이 숫자를 맞춰야 한다. 지금 값은 옵션 여섯 줄을 넣고 잰 것이다.
    // [atelier] 패널 높이는 DOM 에서 잰다. 원본은 상수였는데, 옵션을 하나
    // 넣을 때마다 이 숫자와 색상환 위치를 손으로 맞춰야 했다.
    var PANEL_HEIGHT_FALLBACK = 764;
    var PANEL_BOTTOM_PADDING = 24;
    var PANEL_BLUR_SAMPLES = 13;
    var PANEL_BLUR_STRIDE = 8;

    var COLOR_PICKER_LEFT = 20;

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
    var ROUGHNESS = 0.075;
    var F0 = 0.05;
    var SPECULAR_SCALE = 0.5;
    var DIFFUSE_SCALE = 0.15;
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


    // [atelier] shaders/picker.frag 의 rybToRgb 와 같은 변환을 JS 로.
    // 팔레트 칸을 **엔진과 같은 식**으로 칠해야 보이는 대로 칠해진다.
    function trilinear (p, v000, v100, v010, v001, v101, v011, v110, v111) {
        var x = Math.min(1, Math.max(0, p[0]));
        var y = Math.min(1, Math.max(0, p[1]));
        var z = Math.min(1, Math.max(0, p[2]));
        var out = [0, 0, 0];
        for (var i = 0; i < 3; ++i) {
            out[i] = v000[i] * (1 - x) * (1 - y) * (1 - z) +
                     v100[i] * x * (1 - y) * (1 - z) +
                     v010[i] * (1 - x) * y * (1 - z) +
                     v001[i] * (1 - x) * (1 - y) * z +
                     v101[i] * x * (1 - y) * z +
                     v011[i] * (1 - x) * y * z +
                     v110[i] * x * y * (1 - z) +
                     v111[i] * x * y * z;
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
            'shaders/fullscreen.vert',
            'shaders/advect.frag',
            'shaders/divergence.frag',
            'shaders/jacobi.frag',
            'shaders/subtract.frag',
            'shaders/resize.frag',

            'shaders/project.frag',
            'shaders/distanceconstraint.frag',
            'shaders/planeconstraint.frag',
            'shaders/bendingconstraint.frag',
            'shaders/setbristles.frag',
            'shaders/updatevelocity.frag',

            'shaders/brush.vert', 'shaders/brush.frag',
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

            this.brushProgram = wgl.createProgram(
                shaderSources['shaders/brush.vert'], shaderSources['shaders/brush.frag'], { 'a_position': 0 });

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
            this.brushLastX = 0;
            this.brushLastY = 0;
            this.brushStepped = false;

            this.brushScale = 50;

            // [atelier] 붓을 세운 정도. 슬라이더가 덮어쓴다.
            this.brushHeight = mix(BRUSH_HEIGHT_LAID, BRUSH_HEIGHT_UPRIGHT, INITIAL_UPRIGHT);

            // [atelier] 물감이 붓을 따라 얼마나 끌려가는가. 1 이면 원본.
            this.paintSlip = INITIAL_SLIP;

            // [atelier] 빠른 획을 느린 획에 맞추는 두 값. 실험용으로 열어 둔다.
            this.brushStep = BRUSH_STEP;
            this.maxBrushSteps = MAX_BRUSH_STEPS;
            this.brushSpeedClamp = BRUSH_SPEED_CLAMP;

            // [atelier] 원본은 켤 때마다 무작위 색이었다(Math.random()).
            // 무슨 색인지 이름을 댈 수 없으면 팔레트를 둔 뜻이 없다.
            // 번트 시에나 — 밑칠에 쓰는 고전 안료다.
            this.brushColorHSVA = [0.952, 0.252, 0.805, 0.8];


            this.colorModel = ColorModel.RYB;

            this.needsRedraw = true; //whether we need to redraw the painting


            this.brush = new Brush(wgl, shaderSources, MAX_BRISTLE_COUNT);



            this.fluiditySlider = new Slider(document.getElementById('fluidity-slider'), this.simulator.fluidity, 0.6, 0.9, (function (fluidity) {
              this.simulator.fluidity = fluidity;
            }).bind(this));

            this.bristleCountSlider = new Slider(document.getElementById('bristles-slider'), 1, 0, 1, (function (t) {
                var BRISTLE_SLIDER_POWER = 2.0;
                t = Math.pow(t, BRISTLE_SLIDER_POWER);
                var bristleCount = Math.floor(MIN_BRISTLE_COUNT + t * (MAX_BRISTLE_COUNT - MIN_BRISTLE_COUNT));
                this.brush.setBristleCount(bristleCount);
            }).bind(this));

            // [atelier] 붓을 얼마나 세워 쥐는가
            this.uprightSlider = new Slider(document.getElementById('upright-slider'), INITIAL_UPRIGHT, 0, 1, (function (t) {
                this.brushHeight = mix(BRUSH_HEIGHT_LAID, BRUSH_HEIGHT_UPRIGHT, t);
            }).bind(this));

            // [atelier] 세운 붓을 한쪽으로 기울인 각. 획 내내 고정이다.
            this.tiltSlider = new Slider(document.getElementById('tilt-slider'), 0.25, 0, 1, (function (t) {
                this.brush.tilt = t * MAX_TILT;
            }).bind(this));

            // [atelier] 물감이 붓을 따라 얼마나 끌려가는가.
            this.paintSlipSlider = new Slider(document.getElementById('slip-slider'), INITIAL_SLIP, 0, 1, (function (v) {
                this.paintSlip = v;
            }).bind(this));

            // [atelier] 붓털 밀도. 왼쪽이 원본(면적당 균일), 오른쪽일수록 가운데가 빽빽.
            this.densitySlider = new Slider(document.getElementById('density-slider'), INITIAL_DENSITY, 0.5, 1.0, (function (v) {
                this.brush.density = v;
            }).bind(this));

            // [atelier] 붓털이 얼마나 묶여 있는가.
            //
            // 원본에는 이 제약이 아예 없었다. 붓을 누르면 붓털이 평면에 밀려
            // 사방으로 퍼지고 한 올 한 올이 제 갈 길로 뻗어 별처럼 흩어진다.
            // 실제 붓은 털이 묶여 있어서 눌러도 다발이 유지된다.
            // 1 이면 붓 반지름 안에 머문다. 올리면 원본처럼 흩어진다.
            this.gatherSlider = new Slider(document.getElementById('gather-slider'), 1.0, 0.5, 2.5, (function (v) {
                this.brush.gather = v;
            }).bind(this));

            // [atelier] 붓대가 얼마나 뻣뻣한가 = 붓털의 몇 마디까지 형태를 유지하는가.
            //
            // 원본은 뿌리 한 마디만 고정이라 나머지 아홉 마디가 전부 흐물거렸다.
            // 붓을 움직이면 붓털 끝이 뒤로 길게 끌리고, 그 궤적 하나하나가
            // 빗살로 남는다. 여섯 마디쯤 고정하면 붓이 형태를 지킨 채 눌려
            // 결만 약간 보인다.
            //
            // 휨 제약(u_stiffnessVariation)도 열어 봤지만 거의 듣지 않았다.
            // 실제로 듣는 것은 이쪽이다.
            this.stiffnessSlider = new Slider(document.getElementById('stiffness-slider'), INITIAL_PINNED, 1, 9, (function (v) {
                this.brush.pinnedCount = Math.round(v);
            }).bind(this));

            this.brushSizeSlider = new Slider(document.getElementById('size-slider'), this.brushScale, MIN_BRUSH_SCALE, MAX_BRUSH_SCALE, (function(size) {
                this.brushScale = size;
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


            this.colorPicker = new ColorPicker(this, 'brushColorHSVA', wgl, canvas, shaderSources, COLOR_PICKER_LEFT, 0);

            this.recentColors = [];
            this.panelHeight = PANEL_HEIGHT_FALLBACK;
            this.buildPalette();
            this.setUpBrushCursor();
            this.measurePanel();

            //this.brushViewer = new BrushViewer(wgl, this.brushProgram, 0, 800, 200, 300);


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

    Paint.prototype.brushCss = function () {
        return this.cssForHsv(this.brushColorHSVA[0], this.brushColorHSVA[1], this.brushColorHSVA[2]);
    };

    /** [atelier] 엔진이 쓰는 것과 **같은 변환**. 팔레트 칸이 실제 칠해질 색과 어긋나지 않는다. */
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
            ? Math.min(Math.ceil(ui.scrollHeight) + PANEL_BOTTOM_PADDING,
                       this.canvas.height || PANEL_HEIGHT_FALLBACK)
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
    // 원본은 캔버스 위에서 `cursor: none` 인데 대신 그리는 것이 없어서, 붓이
    // 어디에 얼마만큼 닿는지 보이지 않는다. WebGL 패스를 더 만들지 않고
    // 캔버스 위에 SVG 를 얹는다 — 마우스가 움직일 때마다 화면을 다시 그릴
    // 이유가 없다.

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

        // 패널 위에서는 일반 커서가 맞다.
        // 패널은 WebGL 로 캔버스에 그려서 DOM 으로 못 맞히므로 좌표로 본다.
        var overCanvas = this.pointerIsMouse
            && !(clientX < PANEL_WIDTH && clientY < this.panelHeight);

        this.brushCursor.classList.toggle('visible', overCanvas);
        if (!overCanvas) return;

        this.brushCursor.style.transform = 'translate(' + clientX + 'px,' + clientY + 'px)';
        this.updateBrushCursorShape();
    };

    Paint.prototype.updateBrushCursorShape = function () {
        if (!this.brushCursor || !this.brushCursorRings) return;

        // 붓털 다발이 묶여 있는 범위가 곧 붓이 닿는 자리다
        var angle = 0;
        var rx = this.brushScale * this.brush.gather;
        var ry = rx;

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


    Paint.prototype.update = function () {
        // [atelier] 패널 안의 옵션은 DOM 이고 색 고르개는 WebGL 이다. 패널을
        // 스크롤하면 둘이 어긋나므로 매 프레임 맞춘다. 값이 그대로면
        // measurePanel 은 아무 일도 하지 않는다.
        this.measurePanel();

        // [atelier] 쓰는 색이 바뀌면 팔레트의 선택 표시도 따라간다
        var css = this.brushCss();
        if (css !== this.lastBrushCss) {
            this.lastBrushCss = css;
            this.refreshPaletteSelection();
        }

        var wgl = this.wgl;
        var canvas = this.canvas;
        var simulationFramebuffer = this.simulationFramebuffer;


        // [atelier] 붓을 한 프레임에 한 번만 옮기면 **빠른 획과 느린 획이 달라진다.**
        //
        // 원본은 프레임마다 붓을 새 마우스 위치로 한 번에 점프시키고 그 사이를
        // 캡슐 하나로 잇는다. 그래서
        //
        //   - 느리게 그으면 캡슐이 잔뜩 겹쳐 물감이 두껍게 쌓인다 (뭉침)
        //   - 빠르게 그으면 긴 캡슐 몇 개로만 그려져 얇고 각지고,
        //     붓털 속도(= 프레임당 이동량)가 커져 유체를 훨씬 세게 민다 (밀린 자국)
        //
        // 이동 거리를 붓 크기에 맞춰 잘게 나눠 여러 번 옮긴다. 빠르게 그어도
        // 느리게 그은 것과 같은 간격으로 찍힌다.
        var steps = 1;
        var fromX = this.brushLastX, fromY = this.brushLastY;

        if (this.brushInitialized) {
            if (!this.brushStepped) {
                fromX = this.brushX;
                fromY = this.brushY;
                this.brushStepped = true;
            }

            var travelled = Math.sqrt((this.brushX - fromX) * (this.brushX - fromX) +
                                      (this.brushY - fromY) * (this.brushY - fromY));
            var stepLength = Math.max(1, this.brushStep * this.brushScale);
            steps = Utilities.clamp(Math.ceil(travelled / stepLength), 1, this.maxBrushSteps);
        }

        for (var step = 1; step <= steps; ++step) {
            if (this.brushInitialized) {
                var t = step / steps;
                this.brush.update(fromX + (this.brushX - fromX) * t,
                                  fromY + (this.brushY - fromY) * t,
                                  this.brushHeight * this.brushScale, this.brushScale);
            }

            //splat into paint and velocity textures

            if (this.interactionState === InteractionMode.PAINTING) {
                var splatRadius = SPLAT_RADIUS * this.brushScale;

                var splatColor = hsvToRyb(this.brushColorHSVA[0], this.brushColorHSVA[1], this.brushColorHSVA[2]);

                var alphaT = this.brushColorHSVA[3];

                //we scale alpha based on the number of bristles
                var bristleT = (this.brush.bristleCount - MIN_BRISTLE_COUNT) / (MAX_BRISTLE_COUNT - MIN_BRISTLE_COUNT);

                var minAlpha = mix(THIN_MIN_ALPHA, THICK_MIN_ALPHA, bristleT);
                var maxAlpha = mix(THIN_MAX_ALPHA, THICK_MAX_ALPHA, bristleT);

                var alpha = mix(minAlpha, maxAlpha, alphaT);

                splatColor[3] = alpha;

                var splatVelocityScale = this.paintSlip * SPLAT_VELOCITY_SCALE * splatColor[3] * this.resolutionScale;

                //splat paint
                this.simulator.splat(this.brush, Z_THRESHOLD * this.brushScale, this.paintingRectangle, splatColor, splatRadius, splatVelocityScale,
                    // [atelier] 붓털 속도를 이만큼에서 자른다. 안 자르면 빨리 그을수록
                    // 유체를 세게 밀어 물감이 콧물처럼 끌려간다.
                    this.brushSpeedClamp * this.brushScale);
            }
        }

        this.brushLastX = this.brushX;
        this.brushLastY = this.brushY;

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
                .uniform1f('u_roughness', ROUGHNESS)
                .uniform1f('u_diffuseScale', DIFFUSE_SCALE)
                .uniform1f('u_specularScale', SPECULAR_SCALE)
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



        //draw brush to screen
        if (this.interactionState === InteractionMode.PAINTING || !this.colorPicker.isInUse() && this.interactionState === InteractionMode.NONE && this.desiredInteractionMode(this.mouseX, this.mouseY) === InteractionMode.PAINTING) { //we draw the brush if we're painting or you would start painting on click
            var brushDrawState = wgl.createDrawState()
                .bindFramebuffer(null)
                .viewport(0, 0, this.canvas.width, this.canvas.height)
                .vertexAttribPointer(this.brush.brushTextureCoordinatesBuffer, 0, 2, wgl.FLOAT, wgl.FALSE, 0, 0)

                .useProgram(this.brushProgram)
                .bindIndexBuffer(this.brush.brushIndexBuffer)

                .uniform4f('u_color', 0.6, 0.6, 0.6, 1.0)
                .uniformMatrix4fv('u_projectionViewMatrix', false, this.mainProjectionMatrix)
                .enable(wgl.DEPTH_TEST)

                .enable(wgl.BLEND)
                .blendFunc(wgl.DST_COLOR, wgl.ZERO)

                .uniformTexture('u_positionsTexture', 0, wgl.TEXTURE_2D, this.brush.positionsTexture);

            wgl.drawElements(brushDrawState, wgl.LINES, this.brush.indexCount * this.brush.bristleCount / this.brush.maxBristleCount, wgl.UNSIGNED_SHORT, 0);
        }


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
            .uniform1f('u_roughness', ROUGHNESS)
            .uniform1f('u_diffuseScale', DIFFUSE_SCALE)
            .uniform1f('u_specularScale', SPECULAR_SCALE)
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

    Paint.prototype.onMouseMove = function (event) {
        if (event.preventDefault) event.preventDefault();

        var position = Utilities.getMousePosition(event, this.canvas);

        var mouseX = position.x;
        var mouseY = this.canvas.height - position.y;

        this.brushX = mouseX;
        this.brushY = mouseY;


        if (!this.brushInitialized) {
            this.brush.initialize(this.brushX, this.brushY, this.brushHeight * this.brushScale, this.brushScale);

            this.brushInitialized = true;
        }

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

        this.colorPicker.onMouseMove(position.x, this.canvas.height - position.y);


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
        var mouseOverPanel = mouseX < PANEL_WIDTH && mouseY > this.canvas.height - this.panelHeight;

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

        this.colorPicker.onMouseDown(mouseX, mouseY);

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
                // 색상환을 돌리는 도중이 아니라 **실제로 칠한** 색만 기억한다
                this.rememberColor();

                this.saveSnapshot();
            }
        }
    };

    Paint.prototype.onMouseUp = function (event) {
        if (event.preventDefault) event.preventDefault();

        var position = Utilities.getMousePosition(event, this.canvas);

        this.colorPicker.onMouseUp(position.x, this.canvas.height - position.y);

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


        this.brush.initialize(this.brushX, this.brushY, this.brushHeight * this.brushScale, this.brushScale);
        this.brushInitialized = true;
        // 보간 기준점도 여기서 맞춘다. 안 그러면 첫 프레임에 이전 자리에서 죽 긋는다.
        this.brushLastX = this.brushX;
        this.brushLastY = this.brushY;
        this.brushStepped = true;
    };

    Paint.prototype.onWheel = function (event) {
        event.preventDefault();

        // [atelier] 패널 위에서는 붓 크기가 아니라 패널을 굴린다.
        //
        // 패널(#ui)은 pointer-events: none 이라 휠을 직접 못 받는다. auto 로 두면
        // 밑의 캔버스에 그린 색 고르개를 집을 수 없게 되므로 여기서 대신한다.
        if (event.clientX < PANEL_WIDTH && event.clientY < this.panelHeight) {
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
                this.brush.initialize(this.brushX, this.brushY, this.brushHeight * this.brushScale, this.brushScale);
                this.brushInitialized = true;
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
