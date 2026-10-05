// [atelier] 이 파일은 원본(dli/paint)에 없다.
//
// 붓 끝 마스크를 만든다. 붓털을 시뮬레이션하지 않으므로 붓의 성격은 전부
// 이 회색조 한 장에 들어간다. 흰색이 물감이 묻는 곳이다.
//
// 조사 문서(docs/research)가 권한 3층 구조를 따른다.
//   Macro  전체 실루엣 — flat / filbert / round / knife
//   Meso   강모 — 진행 방향으로 긴 흰 띠와 검은 틈
//   Micro  가장자리와 내부를 조금씩 끊는 잔 알갱이
//
// 노이즈만 곱하면 붓이 아니라 스프레이로 보인다. 강모는 진행 방향과 관련된
// 긴 구조를 가져야 한다.
//
// 좌표계: u 는 진행 방향(짧은 축), v 는 붓의 넓은 쪽(긴 축)이다.
// 그래서 강모 골은 v 를 따라 나뉘고 u 방향으로 길게 이어진다.

var BrushTip = (function () {
    'use strict';

    function createRandom (seed) {
        var state = seed >>> 0;
        return function () {
            state = (state + 0x6d2b79f5) >>> 0;
            var t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function smoothstep (edge0, edge1, x) {
        var t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    /**
     * @param options
     *   size        마스크 한 변의 픽셀 수
     *   hardness    0 이면 가장자리가 완전히 흐리고 1 이면 딱 끊긴다
     *   squareness  0 이면 타원, 1 에 가까울수록 각진 평붓
     *   bristles    강모 줄 수. 0 이면 매끈한 팁 (나이프)
     *   bristleDepth 골의 깊이 0~1
     *   ragged      붓 끝이 갈라진 정도. 실루엣을 들쭉날쭉하게 만든다
     *   seed        같은 씨앗이면 늘 같은 마스크
     */
    function create (options) {
        var size = options.size || 128;
        var hardness = options.hardness !== undefined ? options.hardness : 0.6;
        var squareness = options.squareness || 0;
        var bristles = options.bristles || 0;
        var bristleDepth = options.bristleDepth !== undefined ? options.bristleDepth : 0.5;
        var ragged = options.ragged || 0;
        var random = createRandom((options.seed || 1) * 7919 + size);

        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        var image = ctx.createImageData(size, size);

        // 강모. 자리와 굵기와 깊이가 제각각이라야 빗처럼 보이지 않는다.
        var hairs = [];
        for (var i = 0; i < bristles; ++i) {
            hairs.push({
                centre: ((i + 0.5) / bristles) * 2 - 1 + (random() - 0.5) * (1.4 / bristles),
                width: (0.25 + random() * 0.9) / bristles,
                depth: bristleDepth * (0.25 + random() * 0.75)
            });
        }

        // 붓 끝의 윤곽. 자로 그은 듯 매끈하면 붓으로 안 보인다.
        var EDGE_NODES = 11;
        var edges = [];
        for (var e = 0; e < EDGE_NODES; ++e) edges.push(1 - ragged * random());

        function edgeAt (t) {
            var p = Math.min(0.9999, Math.max(0, t)) * (EDGE_NODES - 1);
            var index = Math.floor(p);
            var f = p - index;
            var eased = f * f * (3 - 2 * f);
            var a = edges[index];
            var b = edges[Math.min(EDGE_NODES - 1, index + 1)];
            return a + (b - a) * eased;
        }

        var soft = Math.max(0.03, 1 - hardness);

        for (var y = 0; y < size; ++y) {
            var v = ((y + 0.5) / size) * 2 - 1;   // 붓의 넓은 쪽

            // 이 줄의 강모 골
            var groove = 0;
            for (var h = 0; h < hairs.length; ++h) {
                var d = (v - hairs[h].centre) / hairs[h].width;
                groove = Math.max(groove, hairs[h].depth * Math.exp(-d * d));
            }

            for (var x = 0; x < size; ++x) {
                var u = ((x + 0.5) / size) * 2 - 1;   // 진행 방향

                // Macro — 각진 평붓은 모서리가 살아 있는 사각형, 아니면 타원
                var spread = Math.max(0.35, edgeAt((v + 1) * 0.5));
                var uu = Math.abs(u) / spread;
                var vv = Math.abs(v);
                var power = 2 + squareness * 6;
                var edge = Math.pow(Math.pow(uu, power) + Math.pow(vv, power), 1 / power);

                var alpha = 1 - smoothstep(1 - soft, 1, edge);

                // Micro — 가장자리 쪽에서만 조금씩 끊는다
                if (alpha > 0) {
                    var speck = 1 - 0.18 * random() * smoothstep(0.35, 1, edge);
                    alpha *= speck;
                }

                var value = Math.max(0, Math.min(1, alpha * (1 - groove)));
                var index2 = (y * size + x) * 4;
                var byte = Math.round(value * 255);
                image.data[index2] = byte;
                image.data[index2 + 1] = byte;
                image.data[index2 + 2] = byte;
                image.data[index2 + 3] = 255;
            }
        }

        ctx.putImageData(image, 0, 0);
        return canvas;
    }

    /**
     * 같은 붓의 마스크 여러 장을 한 장의 아틀라스(2×2)에 담는다.
     *
     * 한 장만 쓰면 dab 마다 똑같은 자국이 찍혀 획에 격자가 생긴다.
     * Krita 의 GIH(image hose) 브러시가 여러 tip 을 돌려 쓰는 것과 같은 이유다.
     */
    function createAtlas (options) {
        var tile = options.size || 128;
        var atlas = document.createElement('canvas');
        atlas.width = tile * 2;
        atlas.height = tile * 2;
        var ctx = atlas.getContext('2d');

        for (var i = 0; i < 4; ++i) {
            var variant = {};
            for (var key in options) variant[key] = options[key];
            variant.size = tile;
            // 같은 붓이지만 강모 배치와 윤곽이 조금씩 다른 네 장
            variant.seed = (options.seed || 1) * 100 + i * 17 + 1;
            ctx.drawImage(create(variant), (i % 2) * tile, Math.floor(i / 2) * tile);
        }
        return atlas;
    }

    /**
     * 캔버스 결.
     *
     * tip 과 다른 층이다. tip 은 붓과 함께 움직이지만 이것은 캔버스에 붙어 있어서,
     * 획을 겹쳐 그어도 **같은 골이 반복해서 비어 있다**. 마른 붓으로 스치면
     * 볼록한 올에만 물감이 걸리는 것이 여기서 나온다. (조사 문서 §5.2 CanvasLocked)
     *
     * 이어 붙여 쓰므로 양 끝이 맞물려야 한다.
     */
    function createGrain (options) {
        var size = options.size || 256;
        var threads = options.threads || 34;
        var random = createRandom((options.seed || 7) * 104729 + size);

        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        var image = ctx.createImageData(size, size);

        // 격자 값을 미리 뽑아 순환시키면 이음매가 생기지 않는다
        var cells = 24;
        var lattice = [];
        for (var i = 0; i < cells * cells; ++i) lattice.push(random());
        function at (cx, cy) {
            return lattice[((cy % cells) + cells) % cells * cells + (((cx % cells) + cells) % cells)];
        }
        function smooth (t) { return t * t * (3 - 2 * t); }

        for (var y = 0; y < size; ++y) {
            for (var x = 0; x < size; ++x) {
                // 씨실과 날실
                var warp = 0.5 + 0.5 * Math.cos(2 * Math.PI * threads * x / size);
                var weft = 0.5 + 0.5 * Math.cos(2 * Math.PI * threads * y / size);
                var weave = Math.max(warp, weft);

                // 올 사이의 불규칙한 요철
                var fx = x / size * cells, fy = y / size * cells;
                var ix = Math.floor(fx), iy = Math.floor(fy);
                var tx = smooth(fx - ix), ty = smooth(fy - iy);
                var noise =
                    (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) +
                    (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;

                // 직조 무늬를 세게 넣으면 천이 아니라 방충망이 된다. 잔 알갱이를 주로 쓴다.
                var value = Math.max(0, Math.min(1, weave * 0.35 + noise * 0.65));
                var index = (y * size + x) * 4;
                var byte = Math.round(value * 255);
                image.data[index] = byte;
                image.data[index + 1] = byte;
                image.data[index + 2] = byte;
                image.data[index + 3] = 255;
            }
        }
        ctx.putImageData(image, 0, 0);
        return canvas;
    }

    return { create: create, createAtlas: createAtlas, createGrain: createGrain };
}());
