// [atelier] 이 파일은 원본(dli/paint)에 없다. 우리가 붙인 브러시 라이브러리다.
//
// 붓을 목록에서 골라 쓴다. 카드 하나가 붓 하나이고, 카드 안의 그림은
// 그 붓의 붓털 배치를 실제로 쓸어 그린 것이다 — 아이콘을 따로 그려 두면
// 붓을 고칠 때마다 그림이 거짓말을 하게 된다.

var BrushLibrary = (function () {
    'use strict';

    var THUMB_WIDTH = 168;
    var THUMB_HEIGHT = 54;


    /**
     * 썸네일에 쓸 도장 한 장.
     *
     * **엔진이 쓰는 것과 같은 마스크**를 BrushTip 으로 만들어 현재 색으로 물들인다.
     * 손으로 그린 아이콘을 쓰면 붓을 고칠 때마다 목록이 거짓말을 한다.
     */
    function makeStamp (preset, colorCss) {
        var tip = BrushTip.create({
            size: 64,
            hardness: preset.hardness,
            squareness: preset.squareness,
            bristles: preset.bristles,
            bristleDepth: preset.bristleDepth,
            ragged: preset.ragged,
            seed: preset.seed || 1
        });

        var size = tip.width;
        var source = tip.getContext('2d').getImageData(0, 0, size, size);

        var rgb = colorCss.match(/\d+/g) || [0, 0, 0];
        var stamp = document.createElement('canvas');
        stamp.width = size;
        stamp.height = size;
        var ctx = stamp.getContext('2d');
        var out = ctx.createImageData(size, size);

        for (var i = 0; i < size * size; ++i) {
            out.data[i * 4] = +rgb[0];
            out.data[i * 4 + 1] = +rgb[1];
            out.data[i * 4 + 2] = +rgb[2];
            // 마스크의 밝기가 곧 물감이 묻는 양이다
            out.data[i * 4 + 3] = source.data[i * 4];
        }
        ctx.putImageData(out, 0, 0);
        return stamp;
    }

    /**
     * 카드 안에 한 획.
     * 엔진과 같은 규칙으로 찍는다 — spacing = radius / dabsPerRadius, 그리고
     * 붓의 긴 축은 진행 방향과 직각이다.
     */
    function drawThumbnail (canvas, preset, colorCss) {
        var ratio = window.devicePixelRatio || 1;
        canvas.width = THUMB_WIDTH * ratio;
        canvas.height = THUMB_HEIGHT * ratio;
        canvas.style.width = THUMB_WIDTH + 'px';
        canvas.style.height = THUMB_HEIGHT + 'px';

        var ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);
        ctx.clearRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

        var stamp = makeStamp(preset, colorCss);

        // 세필과 나이프를 한 칸에서 견주려면 크기를 카드에 맞춰야 한다.
        var radius = Math.max(2.5, (preset.radius / 14) * THUMB_HEIGHT * 0.34);
        var spacing = Math.max(0.6, radius / preset.dabsPerRadius);

        var left = 16;
        var right = THUMB_WIDTH - 14;
        var length = right - left;
        var steps = Math.max(2, Math.ceil(length / spacing));

        ctx.globalAlpha = Math.min(1, 0.22 + preset.alpha * 0.9);

        for (var i = 0; i <= steps; ++i) {
            var t = i / steps;
            var x = left + length * t;
            var y = THUMB_HEIGHT * 0.55 - Math.sin(t * Math.PI) * THUMB_HEIGHT * 0.12;

            // 획의 기울기 → 붓이 향하는 각
            var slope = -Math.cos(t * Math.PI) * Math.PI * THUMB_HEIGHT * 0.12 / length;
            var travel = Math.atan(slope);
            var angle = preset.angle * Math.PI / 180;
            var facing = angle + shortestAngle(angle, travel) * preset.angleFollow;

            // 압력: 약하게 들어가 눌렀다가 떼면서 빠진다 (조사 문서 §9.1 표준 획)
            var pressure = 0.35 + Math.pow(Math.sin(t * Math.PI), 0.7) * 0.65;

            // 엔진과 같은 흔들림. 없으면 목록에서만 자국이 줄을 맞춰 보인다.
            var n0 = ((i * 2654435761) % 1000) / 1000;
            var n1 = ((i * 40503) % 997) / 997;
            var n2 = ((i * 69069) % 991) / 991;
            var r = radius * pressure * (1 + (n2 - 0.5) * 2 * preset.radiusJitter);
            var across = (n1 - 0.5) * 2 * preset.scatter * radius;

            ctx.save();
            ctx.translate(x - Math.sin(facing) * across, y + Math.cos(facing) * across);
            ctx.rotate(facing + (n0 - 0.5) * 2 * preset.angleJitter);
            // 긴 축(높이)이 붓의 넓은 쪽, 짧은 축이 진행 방향이다
            ctx.drawImage(stamp, -r / preset.aspect, -r, (r * 2) / preset.aspect, r * 2);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    function shortestAngle (from, to) {
        var delta = to - from;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        return delta;
    }

    /**
     * @param container  목록을 담을 요소
     * @param groups     [{ name, presets: [...] }]
     * @param onSelect   고른 프리셋을 받는다
     */
    function BrushLibrary (container, groups, onSelect) {
        this.container = container;
        this.groups = groups;
        this.onSelect = onSelect;
        this.cards = [];
        this.selected = null;

        container.innerHTML = '';

        var title = document.createElement('div');
        title.className = 'library-title';
        title.textContent = '붓';
        container.appendChild(title);

        var list = document.createElement('div');
        list.className = 'library-list';
        container.appendChild(list);

        for (var g = 0; g < groups.length; ++g) {
            var group = groups[g];

            var heading = document.createElement('div');
            heading.className = 'library-group';
            heading.textContent = group.name;
            list.appendChild(heading);

            for (var i = 0; i < group.presets.length; ++i) {
                list.appendChild(this.createCard(group.presets[i]));
            }
        }
    }

    BrushLibrary.prototype.createCard = function (preset) {
        var self = this;

        var card = document.createElement('div');
        card.className = 'brush-card';

        var thumb = document.createElement('canvas');
        thumb.className = 'brush-card-thumb';
        card.appendChild(thumb);

        var label = document.createElement('div');
        label.className = 'brush-card-label';
        label.textContent = preset.label || preset.name;
        card.appendChild(label);

        card.addEventListener('click', function () {
            self.select(preset);
        });

        this.cards.push({ preset: preset, element: card, canvas: thumb });
        return card;
    };

    BrushLibrary.prototype.select = function (preset) {
        this.selected = preset;
        for (var i = 0; i < this.cards.length; ++i) {
            var card = this.cards[i];
            card.element.classList.toggle('selected', card.preset === preset);
        }
        this.onSelect(preset);
    };

    /** 쓰는 색이 바뀌면 목록의 획도 그 색으로 다시 긋는다. */
    BrushLibrary.prototype.setColor = function (colorCss) {
        for (var i = 0; i < this.cards.length; ++i) {
            drawThumbnail(this.cards[i].canvas, this.cards[i].preset, colorCss);
        }
    };

    return BrushLibrary;
}());
